/**
 * Prepaid wallet API. GET returns the balance, lifetime spend, mode, and recent
 * ledger; POST adds funds. The top-up is recorded directly here (a sim/instant
 * credit); a real deployment would create a Stripe Checkout session and credit
 * the wallet from the payment webhook instead.
 */
import { hydrateSettings } from "@/lib/runtime-config";
import { billingMode } from "@/lib/billing";
import { getBalance, topUp, listLedger, totalSpent } from "@/lib/repo/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TOPUP_USD = 10_000;

export async function GET() {
  await hydrateSettings();
  const [balance, spent, ledger] = await Promise.all([
    getBalance(),
    totalSpent(),
    listLedger(30),
  ]);
  return Response.json({ billing: { balance, spent, mode: billingMode(), ledger } });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { amount?: number };
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_TOPUP_USD) {
    return Response.json({ error: "invalid amount" }, { status: 400 });
  }
  const balance = await topUp(amount, `Top-up $${amount}`);
  return Response.json({ balance });
}
