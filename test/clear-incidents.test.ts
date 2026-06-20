import { describe, it, expect, beforeEach } from "vitest";
import { resetDatabase } from "./util";
import { clearIncidents } from "@/lib/db/migrate";
import { queryOne } from "@/lib/db/client";
import { ingestError } from "@/lib/ingest";
import { normalizeSentryWebhook, syntheticSentryEvent } from "@/lib/adapters/sentry";
import { getBugByKey } from "@/lib/sim/bugs";
import { setSettings, getSetting } from "@/lib/repo/settings";

async function count(table: string): Promise<number> {
  const r = await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
  return r?.n ?? 0;
}

describe("clearIncidents", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("clears incidents + artifacts but preserves config (settings survive)", async () => {
    await setSettings({ ANTHROPIC_API_KEY: "sk-keep-me" });
    const bug = getBugByKey("checkout-missing-price")!;
    await ingestError(normalizeSentryWebhook(syntheticSentryEvent(bug)));

    expect(await count("incidents")).toBeGreaterThan(0);
    expect(await count("events")).toBeGreaterThan(0);

    await clearIncidents();

    expect(await count("incidents")).toBe(0);
    expect(await count("events")).toBe(0);
    expect(await count("jobs")).toBe(0);

    // Config is deliberately preserved.
    expect(await getSetting("ANTHROPIC_API_KEY")).toBe("sk-keep-me");
  });
});
