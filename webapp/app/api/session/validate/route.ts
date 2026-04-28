import { createAuthJsonResponse } from "@/lib/auth-api";
import { getAuthContext, getSessionFromCookies } from "@/lib/auth";

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

  const authContext = await getAuthContext();

  return createAuthJsonResponse({
    ok: true,
    activeWorkspaceId: authContext?.workspaceId ?? null,
    user: {
      id: session.user.id,
      email: session.user.email,
      fullName: session.user.fullName,
      role: session.user.role,
    },
  });
}
