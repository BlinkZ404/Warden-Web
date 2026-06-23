// Next 16 renamed the `middleware` file convention to `proxy` (it runs as a
// proxy in front of routing/cache). The default export is still the request
// handler; here that's Clerk's `clerkMiddleware` (its API name is unchanged),
// or a pass-through when auth isn't configured.
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { AUTH_ENABLED } from "@/lib/auth";

// The operator/founder surfaces. Everything else (landing, docs, and the
// machine-to-machine APIs that carry their own signature / shared-secret auth)
// stays reachable; Clerk still populates the auth context on those without
// blocking them.
const isProtected = createRouteMatcher(["/dashboard(.*)", "/approve(.*)", "/report(.*)"]);

export default AUTH_ENABLED
  ? clerkMiddleware(async (auth, req) => {
      if (isProtected(req)) await auth.protect();
    })
  : () => NextResponse.next();

export const config = {
  matcher: [
    // Run on app routes, skipping Next internals and static assets.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|webmanifest)).*)",
    // Always run on API routes so route handlers can read the session.
    "/(api)(.*)",
  ],
};
