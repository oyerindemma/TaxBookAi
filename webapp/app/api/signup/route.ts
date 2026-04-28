import { Prisma, Role } from "@prisma/client";
import { hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  createAuthenticatedResponse,
  createAuthErrorResponse,
  createAuthServerErrorResponse,
  isPrismaTransactionTimeoutError,
  isUniqueConstraintError,
  parseJsonRequest,
} from "@/lib/auth-api";
import {
  AUTH_WORKSPACE_BOOTSTRAP_TIMEOUT_MS,
  provisionStarterWorkspace,
} from "@/lib/auth-workspace";
import { LEGAL_VERSION } from "@/lib/config/compliance";
import { logRouteError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { type SignupBody, validateSignupPayload } from "@/lib/auth-validation";

export const runtime = "nodejs";

const CREATED_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export async function POST(request: Request) {
  const parsedBody = await parseJsonRequest<SignupBody>(request);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const validation = validateSignupPayload(parsedBody.data);
  if (!validation.ok) {
    return createAuthErrorResponse(
      {
        error: "Please correct the highlighted fields.",
        fieldErrors: validation.fieldErrors,
      },
      400
    );
  }

  const { email, password, fullName } = validation.data;

  try {
    const passwordHash = await hashPassword(password);
    const createdUser = await prisma.$transaction(
      async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            password: passwordHash,
            fullName,
            role: Role.USER,
          },
          select: CREATED_USER_SELECT,
        });

        const workspaceId = await provisionStarterWorkspace(tx, {
          userId: user.id,
          fullName,
        });

        return {
          user,
          workspaceId,
        };
      },
      { timeout: AUTH_WORKSPACE_BOOTSTRAP_TIMEOUT_MS }
    );

    try {
      await Promise.all([
        logAudit({
          workspaceId: createdUser.workspaceId,
          actorUserId: createdUser.user.id,
          targetUserId: createdUser.user.id,
          action: "USER_SIGNED_UP",
          metadata: {
            legalVersion: LEGAL_VERSION,
          },
        }),
        logAudit({
          workspaceId: createdUser.workspaceId,
          actorUserId: createdUser.user.id,
          targetUserId: createdUser.user.id,
          action: "LEGAL_TERMS_ACCEPTED",
          metadata: {
            legalVersion: LEGAL_VERSION,
            acceptedAt: new Date().toISOString(),
            source: "signup",
          },
        }),
      ]);
    } catch (auditError) {
      logRouteError("signup audit failed", auditError, {
        email,
        userId: createdUser.user.id,
        workspaceId: createdUser.workspaceId,
      });
    }

    return createAuthenticatedResponse({
      userId: createdUser.user.id,
      user: createdUser.user,
      workspaceId: createdUser.workspaceId,
      status: 201,
    });
  } catch (error) {
    if (isUniqueConstraintError(error, "email")) {
      return createAuthErrorResponse(
        {
          error: "An account already exists for that email. Log in instead.",
          fieldErrors: {
            email: "An account already exists for this email address.",
          },
        },
        409
      );
    }

    return createAuthServerErrorResponse("/api/signup", error, {
      message: isPrismaTransactionTimeoutError(error)
        ? "Account setup could not finish because workspace setup timed out. Please try again."
        : "We could not create your account right now. Please try again.",
      metadata: {
        email,
      },
    });
  }
}
