/**
 * The current request's human actor, resolved from the Clerk session.
 *
 * Used by the human-decision endpoints (approve, revert) so a decision is
 * attributed to the *signed-in user* rather than a client-supplied name. Returns
 * null when auth is off or there is no session, in which case the caller falls
 * back to the shared API-secret gate (scripted / operator / cron).
 */
import { auth, currentUser } from "@clerk/nextjs/server";
import { AUTH_ENABLED } from "@/lib/auth";

export async function sessionActor(): Promise<string | null> {
  if (!AUTH_ENABLED) return null;
  const { userId } = await auth();
  if (!userId) return null;
  const user = await currentUser();
  return user?.primaryEmailAddress?.emailAddress ?? user?.username ?? userId;
}
