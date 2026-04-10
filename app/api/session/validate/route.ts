import { createAuthJsonResponse } from "@/lib/auth-api";
import { getSessionFromCookies } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSessionFromCookies();

  if (!session) {
    return createAuthJsonResponse(
      {
        ok: false,
        user: null,
      },
      { status: 401 }
    );
  }

  return createAuthJsonResponse({
    ok: true,
    user: {
      id: session.user.id,
      email: session.user.email,
      fullName: session.user.fullName,
      role: session.user.role,
    },
  });
}
