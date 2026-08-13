import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/prihlaseni",
  "/registrace",
  "/zapomenute-heslo",
  "/reset-hesla",
];

/**
 * Fast cookie-presence gate for pages. Real session validation happens
 * server-side in the (app) layout — middleware cannot query the DB.
 *
 * Deliberately one-directional: a *stale* cookie (valid format, no session row
 * in the DB) must not bounce between here and the layout redirect. Sending
 * already-authenticated users away from the login page is handled on the
 * client, where the session can actually be verified.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession =
    req.cookies.has("__Host-session") || req.cookies.has("session");

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (!hasSession && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/prihlaseni";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except API routes, Next internals and static assets.
  matcher: ["/((?!api|_next|favicon.ico|.*\\..*).*)"],
};
