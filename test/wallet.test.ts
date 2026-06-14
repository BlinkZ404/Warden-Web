import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDatabase } from "./util";
import { setSettings } from "@/lib/repo/settings";
import { hydrateSettings } from "@/lib/runtime-config";
import { getBalance, topUp, debit, totalSpent, listLedger } from "@/lib/repo/wallet";
import { meterRun, billingMode, insufficientBalance } from "@/lib/billing";
import { STARTING_BALANCE_USD, runRateUsd } from "@/lib/pricing";

const INC = "00000000-0000-0000-0000-000000000000";

describe("wallet + managed billing", () => {
  beforeEach(async () => {
    await resetDatabase();
    await hydrateSettings(); // empty overlay → defaults (managed)
  });
  afterAll(async () => {
    await resetDatabase();
    await hydrateSettings();
  });

  it("seeds the starting balance and defaults to managed mode", async () => {
    expect(billingMode()).toBe("managed");
    expect(await getBalance()).toBe(STARTING_BALANCE_USD);
  });

  it("tops up and debits, recording the ledger with balance_after", async () => {
    await topUp(10);
    expect(await getBalance()).toBeCloseTo(STARTING_BALANCE_USD + 10, 4);

    const bal = await debit(0.04, { incidentId: INC, model: "Opus", description: "fixer run" });
    expect(bal).toBeCloseTo(STARTING_BALANCE_USD + 10 - 0.04, 4);
    expect(await totalSpent()).toBeCloseTo(0.04, 4);

    const led = await listLedger();
    expect(led[0].kind).toBe("debit");
    expect(led[0].balance_after).toBeCloseTo(bal, 4);
    expect(led[0].model).toBe("Opus");
  });

  it("meters a managed run at the assigned model's rate; byok meters nothing", async () => {
    await setSettings({ FIXER_MODEL: "claude::claude-opus-4-8" });
    await hydrateSettings();
    const before = await getBalance();
    await meterRun(INC, { roleKey: "FIXER_MODEL" });
    expect(before - (await getBalance())).toBeCloseTo(runRateUsd("claude-opus-4-8"), 4); // 0.04

    await setSettings({ BILLING_MODE: "byok" });
    await hydrateSettings();
    const b2 = await getBalance();
    await meterRun(INC, { roleKey: "FIXER_MODEL" });
    expect(await getBalance()).toBe(b2); // unchanged
  });

  it("prices a reviewer run off its own model name", async () => {
    const before = await getBalance();
    await meterRun(INC, { model: "claude-haiku-4-5 #2" }); // suffix stripped → fast tier
    expect(before - (await getBalance())).toBeCloseTo(runRateUsd("claude-haiku-4-5"), 4); // 0.006
  });

  it("tiers model rates without the substring trap", () => {
    // "mini" inside gemini/minimax must NOT fold them into the cheap fast tier.
    expect(runRateUsd("gemini-3.1-pro-preview")).toBe(0.04);
    expect(runRateUsd("MiniMax-M3")).not.toBe(0.006);
    expect(runRateUsd("gpt-5.4-mini")).toBe(0.006); // a real "-mini" suffix is fast
    expect(runRateUsd("claude-haiku-4-5")).toBe(0.006);
    expect(runRateUsd("claude-opus-4-8")).toBe(0.04);
    expect(runRateUsd("grok-4.20-0309-non-reasoning")).not.toBe(0.04); // "non-reasoning" ≠ frontier
  });

  it("flags insufficient balance only when managed and empty", async () => {
    expect(await insufficientBalance()).toBe(false); // funded
    await debit(STARTING_BALANCE_USD, { incidentId: INC });
    expect(await getBalance()).toBe(0);
    expect(await insufficientBalance()).toBe(true);

    await setSettings({ BILLING_MODE: "byok" });
    await hydrateSettings();
    expect(await insufficientBalance()).toBe(false); // byok never gates on balance
  });
});
