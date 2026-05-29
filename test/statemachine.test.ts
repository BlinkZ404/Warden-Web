import { describe, it, expect, beforeEach } from "vitest";
import { createIncident } from "@/lib/repo/incidents";
import { listEvents } from "@/lib/repo/events";
import { transition, canTransition, IllegalTransitionError } from "@/lib/statemachine";
import { resetDatabase, statusOf } from "./util";

const HAPPY_PATH = [
  "triaging",
  "investigating",
  "fix_proposed",
  "under_review",
  "verifying",
  "awaiting_approval",
  "approved",
  "deploying",
  "verifying_prod",
  "resolved",
] as const;

describe("incident state machine (M1)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("walks the full happy path and logs every transition", async () => {
    const inc = await createIncident({
      fingerprint: "fp-sm-1",
      title: "Checkout crash",
    });
    expect(inc.status).toBe("detected");

    for (const next of HAPPY_PATH) {
      await transition(inc.id, next, "system");
    }

    expect(await statusOf(inc.id)).toBe("resolved");

    const events = await listEvents(inc.id);
    const stateChanges = events.filter((e) => e.type === "state_change");
    expect(stateChanges).toHaveLength(HAPPY_PATH.length);
    // events form an ordered chain: each `to` becomes the next `from`
    expect(stateChanges[0].payload).toMatchObject({ from: "detected", to: "triaging" });
    expect(stateChanges.at(-1)!.payload).toMatchObject({
      from: "verifying_prod",
      to: "resolved",
    });
  });

  it("rejects illegal transitions", async () => {
    const inc = await createIncident({ fingerprint: "fp-sm-2", title: "x" });
    await expect(transition(inc.id, "deploying", "system")).rejects.toBeInstanceOf(
      IllegalTransitionError,
    );
    // status unchanged, no event written
    expect(await statusOf(inc.id)).toBe("detected");
    expect(await listEvents(inc.id)).toHaveLength(0);
  });

  it("is idempotent: re-transitioning to the current state is a no-op", async () => {
    const inc = await createIncident({ fingerprint: "fp-sm-3", title: "x" });
    await transition(inc.id, "triaging", "system");
    const again = await transition(inc.id, "triaging", "system");
    expect(again.noop).toBe(true);
    const stateChanges = (await listEvents(inc.id)).filter(
      (e) => e.type === "state_change",
    );
    expect(stateChanges).toHaveLength(1);
  });

  it("routes disagreement/error states correctly", () => {
    expect(canTransition("under_review", "escalated")).toBe(true);
    expect(canTransition("verifying", "awaiting_approval")).toBe(true);
    expect(canTransition("deploying", "rolled_back")).toBe(true);
    expect(canTransition("detected", "resolved")).toBe(false);
    expect(canTransition("resolved", "deploying")).toBe(false);
  });
});
