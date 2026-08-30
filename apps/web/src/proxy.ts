import { NextResponse } from "next/server";
import { auth } from "../auth";

/**
 * Redirect-to-sign-in convenience for page views only. This is NOT the
 * source of truth for authorization — Next.js 16 explicitly warns that a
 * routing change can silently drop Proxy coverage, and Server Functions
 * bypass it if their route isn't matched. Every server action/query must
 * independently check `await auth()` and scope by session.user.id.
 */
export default auth((req) => {
  const isSignedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  if (!isSignedIn && pathname !== "/sign-in") {
    const signInUrl = new URL("/sign-in", req.nextUrl.origin);
    return NextResponse.redirect(signInUrl);
  }
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon|apple-icon|logo|manifest.webmanifest|privacy).*)",
  ],
};
