import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  buildSessionCookieOptions,
  deleteSessionByToken,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import {
  buildWorkspaceCookieOptions,
  WORKSPACE_COOKIE_NAME,
} from "@/lib/workspaces";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (token) {
      await deleteSessionByToken(token);
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: "",
      ...buildSessionCookieOptions(),
      maxAge: 0,
      expires: new Date(0),
    });
    response.cookies.set({
      name: WORKSPACE_COOKIE_NAME,
      value: "",
      ...buildWorkspaceCookieOptions(),
      maxAge: 0,
      expires: new Date(0),
    });
    return response;
  } catch (error) {
    logRouteError("logout failed", error);
    return NextResponse.json(
      { error: "Server error logging out" },
      { status: 500 }
    );
  }
}
