/**
 * Authentication is active only when Clerk is configured. With the keys present,
 * the dashboard / approve / report surfaces require sign-in and an approval is
 * attributed to the signed-in user. Without the keys the app runs open (handy
 * for a quick local demo, tests, and the unattended `npm run demo`).
 *
 * This module deliberately imports nothing from Clerk so it is safe to read from
 * the proxy, the root layout, and route handlers alike. The check is on the
 * server secret (read at runtime), so flipping the env flips auth without a code
 * change.
 */
export const AUTH_ENABLED = !!process.env.CLERK_SECRET_KEY;
