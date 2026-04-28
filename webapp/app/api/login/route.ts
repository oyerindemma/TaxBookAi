import { Prisma } from "@prisma/client";
import { verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  createAuthenticatedResponse,
  createAuthErrorResponse,
  createAuthServerErrorResponse,
  parseJsonRequest,
} from "@/lib/auth-api";
import { ensureActiveWorkspaceForUser } from "@/lib/auth-workspace";
import { logRouteError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { type LoginBody, validateLoginPayload } from "@/lib/auth-validation";

export const runtime = "nodejs";

const AUTHENTICATED_USER_SELECT = {
  id: true,
  email: true,
  password: true,
  fullName: true,
  role: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export async function POST(request: Request) {
  const parsedBody = await parseJsonRequest<LoginBody>(request);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const validation = validateLoginPayload(parsedBody.data);
  if (!validation.ok) {
    return createAuthErrorResponse(
      {
        error: "Please enter both your email and password.",
        fieldErrors: validation.fieldErrors,
      },
      400
    );
  }

  const { email, password } = validation.data;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: AUTHENTICATED_USER_SELECT,
    });

    if (!user) {
      return createAuthErrorResponse(
        { error: "Invalid email or password." },
        401
      );
    }

    const passwordMatches = await verifyPassword(password, user.password);
    if (!passwordMatches) {
      return createAuthErrorResponse(
        { error: "Invalid email or password." },
        401
      );
    }

    const workspaceId = await ensureActiveWorkspaceForUser({
      userId: user.id,
      fullName: user.fullName,
    });

    try {
      await logAudit({
        workspaceId,
        actorUserId: user.id,
        targetUserId: user.id,
        action: "USER_LOGGED_IN",
        metadata: {
          loginAt: new Date().toISOString(),
        },
      });
    } catch (auditError) {
      logRouteError("login audit failed", auditError, {
        userId: user.id,
        workspaceId,
      });
    }

    return createAuthenticatedResponse({
      userId: user.id,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        createdAt: user.createdAt,
      },
      workspaceId,
    });
  } catch (error) {
    return createAuthServerErrorResponse("/api/login", error, {
      message: "We could not log you in right now. Please try again.",
      metadata: {
        email,
      },
    });
  }
}
