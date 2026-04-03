import { NextResponse, type NextRequest } from "next/server";
import { buildSessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/auth";
import { logRouteError } from "@/lib/logger";
import { buildWorkspaceCookieOptions, WORKSPACE_COOKIE_NAME } from "@/lib/workspaces";

function redirectToLogin(req: NextRequest) {
  const nextPath = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  const url = new URL("/login", req.url);
  url.searchParams.set("next", nextPath);
  const res = NextResponse.redirect(url);
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    ...buildSessionCookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  });
  res.cookies.set(WORKSPACE_COOKIE_NAME, "", {
    ...buildWorkspaceCookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  });
  return res;
}

export async function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return redirectToLogin(req);
  }

  try {
    const validateUrl = new URL("/api/session/validate", req.url);
    const response = await fetch(validateUrl, {
      method: "GET",
      headers: {
        cookie: req.headers.get("cookie") ?? "",
      },
      cache: "no-store",
    });

    if (response.ok) {
      return NextResponse.next();
    }
  } catch (error) {
    logRouteError("proxy session validation failed", error, {
      pathname: req.nextUrl.pathname,
    });
  }

  return redirectToLogin(req);
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
