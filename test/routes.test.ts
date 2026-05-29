import { describe, it, expect, beforeEach } from "vitest";
import { resetDatabase } from "./util";
import { POST as fire } from "@/app/api/sim/fire/route";
import { POST as approve } from "@/app/api/incidents/[id]/approve/route";
import { POST as rollback } from "@/app/api/incidents/[id]/rollback/route";
import { getIncident } from "@/lib/repo/incidents";
import { latestFixAttempt, latestDeployment } from "@/lib/repo/artifacts";
import { destroyWorkspace } from "@/lib/adapters/workspace";

/**
 * Exercises the actual route handlers (body parsing, status codes, inline
 * drain) — not just the lib functions — since the approve/revert buttons are
 * the demo climax. Invokes the handlers with real Request objects.
 */
function req(body?: unknown): Request {
  return new Request("http://test/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("API route handlers (HTTP smoke)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("fire → approve → resolved → one-tap revert → rolled_back", async () => {
    const fireRes = await fire(req({ bugKey: "checkout-missing-price" }));
    expect(fireRes.status).toBe(201);
    const { incidentId } = (await fireRes.json()) as { incidentId: string };
    expect((await getIncident(incidentId))!.status).toBe("awaiting_approval");

    const apprRes = await approve(req({ decision: "approve" }), params(incidentId));
    expect(apprRes.status).toBe(200);
    expect(((await apprRes.json()) as { status: string }).status).toBe("resolved");

    const fa = await latestFixAttempt(incidentId);
    expect((await latestDeployment(fa!.id))!.promoted_at).not.toBeNull();

    // One tap to revert (the headline promise).
    const revRes = await rollback(req({}), params(incidentId));
    expect(revRes.status).toBe(200);
    expect(((await revRes.json()) as { status: string }).status).toBe("rolled_back");
    expect((await latestDeployment(fa!.id))!.rolled_back).toBe(true);

    await destroyWorkspace(incidentId);
  });

  it("approve on a non-awaiting incident → 409", async () => {
    const { incidentId } = (await (
      await fire(req({ bugKey: "checkout-missing-price" }))
    ).json()) as { incidentId: string };
    await approve(req({ decision: "approve" }), params(incidentId)); // → resolved
    const again = await approve(req({ decision: "approve" }), params(incidentId));
    expect(again.status).toBe(409);
    await destroyWorkspace(incidentId);
  });

  it("approve with an invalid decision → 400", async () => {
    const { incidentId } = (await (
      await fire(req({ bugKey: "discount-unknown-code" }))
    ).json()) as { incidentId: string };
    const bad = await approve(req({ decision: "maybe" }), params(incidentId));
    expect(bad.status).toBe(400);
    await destroyWorkspace(incidentId);
  });
});
