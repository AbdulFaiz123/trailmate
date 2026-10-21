import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath, safeNext, SESSION_COOKIE, sessionSecret, verifySession } from "@/lib/auth";

/**
 * Every page and API route needs the session cookie, except the few public
 * paths in isPublicPath(). Without APP_PASSWORD the app stays open in
 * development and refuses to serve anything in production.
 */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const secret = sessionSecret();
  if (!secret) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return notConfigured(pathname);
  }

  if (await verifySession(req.cookies.get(SESSION_COOKIE)?.value, secret)) return NextResponse.next();

  // Data requests get a plain 401; the app's fetches and the outbox handle that like any failed request.
  if (pathname.startsWith("/api/") || req.method !== "GET" || req.headers.get("RSC") === "1") {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  const login = new URL("/login", req.url);
  const next = safeNext(pathname + search);
  if (next !== "/") login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}

function notConfigured(pathname: string) {
  const message = "Trailmate is locked: set APP_PASSWORD in .env and restart the server.";
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: message }, { status: 503 });
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Trailmate</title>` +
      `<body style="font-family:system-ui;max-width:28rem;margin:4rem auto;padding:0 1rem"><h1>Not set up yet</h1><p>${message}</p></body>`,
    { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export const config = {
  // Node.js runtime: reads APP_PASSWORD from the real environment at request time.
  runtime: "nodejs",
  // Skip build assets; everything else goes through the checks above.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
