import { query, queryOne } from "@/lib/db/client";
import type { PushSubscription } from "@/lib/db/types";

export async function saveSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_id?: string | null;
}): Promise<PushSubscription> {
  return (await queryOne<PushSubscription>(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_id)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
     RETURNING *`,
    [input.endpoint, input.p256dh, input.auth, input.user_id ?? null],
  ))!;
}

export async function listSubscriptions(): Promise<PushSubscription[]> {
  return query<PushSubscription>("SELECT * FROM push_subscriptions");
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  await query("DELETE FROM push_subscriptions WHERE endpoint = $1", [endpoint]);
}
