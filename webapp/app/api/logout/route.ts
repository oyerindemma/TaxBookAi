import { cookies } from "next/headers";
import { deleteSessionByToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import {
  clearAuthCookies,
  createAuthJsonResponse,
  createAuthServerErrorResponse,
} from "@/lib/auth-api";

export const runtime = "nodejs";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (token) {
      await deleteSessionByToken(token);
    }

    const response = createAuthJsonResponse({ ok: true });
    clearAuthCookies(response);
    return response;
  } catch (error) {
    return createAuthServerErrorResponse("/api/logout", error, {
      message: "We could not log you out right now. Please try again.",
    });
  }
}
