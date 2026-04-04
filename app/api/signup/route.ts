import { Prisma, Role, SubscriptionPlan, WorkspaceRole } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  buildSessionCookieOptions,
  createSession,
  hashPassword,
  normalizeEmail,
  normalizeFullName,
  SESSION_COOKIE_NAME,
  validateEmail,
  validateFullName,
  validatePassword,
} from "@/lib/auth";
import { seedDefaultExpenseCategories } from "@/lib/expense-categories";
import { logRouteError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  buildWorkspaceCookieOptions,
  WORKSPACE_COOKIE_NAME,
} from "@/lib/workspaces";

export const runtime = "nodejs";

const WORKSPACE_BOOTSTRAP_TIMEOUT_MS = 15_000;
const AUTH_DEBUG_ENABLED = process.env.AUTH_DEBUG === "true";

type SignupBody = {
  email?: unknown;
  password?: unknown;
  fullName?: unknown;
  confirmPassword?: unknown;
};

const CREATED_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

function getPrismaErrorMetadata(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return {
      type: "known_request",
      code: error.code,
      clientVersion: error.clientVersion,
      meta: error.meta ?? null,
      message: error.message,
    };
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return {
      type: "validation",
      message: error.message,
    };
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return {
      type: "initialization",
      errorCode: error.errorCode ?? null,
      clientVersion: error.clientVersion,
      message: error.message,
    };
  }

  if (error instanceof Prisma.PrismaClientRustPanicError) {
    return {
      type: "rust_panic",
      clientVersion: error.clientVersion,
      message: error.message,
    };
  }

  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return {
      type: "unknown_request",
      clientVersion: error.clientVersion,
      message: error.message,
    };
  }

  return null;
}

function buildValidationResult(body: SignupBody) {
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body.password === "string" ? body.password : "";
  const fullName =
    typeof body.fullName === "string" ? normalizeFullName(body.fullName) : "";
  const confirmPassword =
    typeof body.confirmPassword === "string" ? body.confirmPassword : "";

  const fieldErrors: Record<string, string> = {};

  const emailError = validateEmail(email);
  if (emailError) {
    fieldErrors.email = emailError;
  }

  const fullNameError = validateFullName(fullName);
  if (fullNameError) {
    fieldErrors.fullName = fullNameError;
  }

  if (!password.trim()) {
    fieldErrors.password = "Enter your password.";
  } else {
    const passwordError = validatePassword(password);
    if (passwordError) {
      fieldErrors.password = passwordError;
    }
  }

  if (!confirmPassword) {
    fieldErrors.confirmPassword = "Confirm your password.";
  } else if (confirmPassword !== password) {
    fieldErrors.confirmPassword = "Passwords do not match.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false as const,
      fieldErrors,
    };
  }

  return {
    ok: true as const,
    email,
    password,
    fullName,
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SignupBody;
    const validation = buildValidationResult(body);

    if (!validation.ok) {
      return NextResponse.json(
        {
          error: "Please correct the highlighted fields.",
          fieldErrors: validation.fieldErrors,
        },
        { status: 400 }
      );
    }

    const { email, password, fullName } = validation;
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          error: "An account already exists for that email. Log in instead.",
          fieldErrors: {
            email: "An account already exists for this email address.",
          },
        },
        { status: 409 }
      );
    }

    const hashedPassword = await hashPassword(password);
    const created = await prisma.$transaction(async (tx) => {
      const userData = {
        email,
        password: hashedPassword,
        fullName,
        role: Role.USER,
      } satisfies Prisma.UserCreateInput;

      const user = await tx.user.create({
        data: userData,
        select: CREATED_USER_SELECT,
      });

      const workspaceData = {
        name: `${fullName}'s Workspace`,
      } satisfies Prisma.WorkspaceCreateInput;

      const workspace = await tx.workspace.create({
        data: workspaceData,
        select: { id: true },
      });

      const workspaceMemberData = {
        workspaceId: workspace.id,
        userId: user.id,
        role: WorkspaceRole.OWNER,
      } satisfies Prisma.WorkspaceMemberUncheckedCreateInput;

      await tx.workspaceMember.create({
        data: workspaceMemberData,
      });

      const workspaceSubscriptionData = {
        workspaceId: workspace.id,
        plan: SubscriptionPlan.STARTER,
        status: "free",
      } satisfies Prisma.WorkspaceSubscriptionUncheckedCreateInput;

      await tx.workspaceSubscription.create({
        data: workspaceSubscriptionData,
      });

      await seedDefaultExpenseCategories(tx, workspace.id);

      return {
        user,
        workspaceId: workspace.id,
      };
    }, { timeout: WORKSPACE_BOOTSTRAP_TIMEOUT_MS });

    const { token, expiresAt } = await createSession(created.user.id);
    const response = NextResponse.json(
      {
        user: created.user,
      },
      { status: 201 }
    );

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      ...buildSessionCookieOptions(expiresAt),
    });
    response.cookies.set({
      name: WORKSPACE_COOKIE_NAME,
      value: String(created.workspaceId),
      ...buildWorkspaceCookieOptions(),
    });

    return response;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        {
          error: "An account already exists for that email. Log in instead.",
          fieldErrors: {
            email: "An account already exists for this email address.",
          },
        },
        { status: 409 }
      );
    }

    const details = error instanceof Error ? error.message : String(error);
    const prismaError = getPrismaErrorMetadata(error);
    const prismaDebug =
      prismaError &&
      "message" in prismaError &&
      typeof prismaError.message === "string"
        ? {
            prismaCode:
              "code" in prismaError && typeof prismaError.code === "string"
                ? prismaError.code
                : "errorCode" in prismaError && typeof prismaError.errorCode === "string"
                  ? prismaError.errorCode
                  : null,
            prismaMessage: prismaError.message,
          }
        : null;
    logRouteError("/api/signup", error, prismaError ? { prisma: prismaError } : undefined);

    const errorMessage =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2028"
        ? "Account setup could not finish because workspace setup timed out. Please try again."
        : "We could not create your account right now. Please try again.";

    return NextResponse.json(
      {
        error: errorMessage,
        ...((process.env.NODE_ENV !== "production" || AUTH_DEBUG_ENABLED)
          ? {
              details,
              ...(prismaDebug ? { prisma: prismaDebug } : {}),
            }
          : {}),
      },
      { status: 500 }
    );
  }
}
