import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  buildSessionCookieOptions,
  createSession,
  normalizeEmail,
  SESSION_COOKIE_NAME,
  validateEmail,
  verifyPassword,
} from "@/lib/auth";
import { seedDefaultExpenseCategories } from "@/lib/expense-categories";
import { logInfo, logRouteError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  buildWorkspaceCookieOptions,
  WORKSPACE_COOKIE_NAME,
} from "@/lib/workspaces";

export const runtime = "nodejs";

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

const WORKSPACE_BOOTSTRAP_TIMEOUT_MS = 15_000;
const LOGIN_DEBUG_ENABLED = process.env.AUTH_DEBUG === "true";

function logLoginDebug(message: string, metadata?: Record<string, unknown>) {
  if (!LOGIN_DEBUG_ENABLED) return;
  logInfo("auth-login", message, metadata);
}

function buildValidationResult(body: LoginBody) {
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body.password === "string" ? body.password : "";
  const fieldErrors: Record<string, string> = {};

  const emailError = validateEmail(email);
  if (emailError) {
    fieldErrors.email = emailError;
  }

  if (!password.trim()) {
    fieldErrors.password = "Enter your password.";
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
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as LoginBody;
    const validation = buildValidationResult(body);

    if (!validation.ok) {
      return NextResponse.json(
        {
          error: "Please enter both your email and password.",
          fieldErrors: validation.fieldErrors,
        },
        { status: 400 }
      );
    }

    const { email, password: inputPassword } = validation;
    logLoginDebug("Validated login request", { email });

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        fullName: true,
        role: true,
        createdAt: true,
      },
    });

    logLoginDebug("Completed user lookup", {
      email,
      found: Boolean(user),
      userId: user?.id ?? null,
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const passwordMatches = await verifyPassword(inputPassword, user.password);

    logLoginDebug("Completed password comparison", {
      userId: user.id,
      passwordMatches,
    });

    if (!passwordMatches) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const membership = await prisma.workspaceMember.findFirst({
      where: {
        userId: user.id,
        workspace: {
          archivedAt: null,
        },
      },
      orderBy: {
        workspace: {
          name: "asc",
        },
      },
      select: {
        workspaceId: true,
      },
    });

    logLoginDebug("Checked active workspace membership", {
      userId: user.id,
      workspaceId: membership?.workspaceId ?? null,
    });

    let workspaceId = membership?.workspaceId;

    if (!workspaceId) {
      const totalMemberships = await prisma.workspaceMember.count({
        where: { userId: user.id },
      });

      logLoginDebug("Counted workspace memberships", {
        userId: user.id,
        totalMemberships,
      });

      if (totalMemberships === 0) {
        logLoginDebug("Bootstrapping default workspace", {
          userId: user.id,
          timeoutMs: WORKSPACE_BOOTSTRAP_TIMEOUT_MS,
        });

        const workspace = await prisma.$transaction(
          async (tx) => {
            const createdWorkspace = await tx.workspace.create({
              data: {
                name: `${user.fullName}'s Workspace`,
              },
              select: { id: true },
            });

            await tx.workspaceMember.create({
              data: {
                workspaceId: createdWorkspace.id,
                userId: user.id,
                role: "OWNER",
              },
            });

            await tx.workspaceSubscription.create({
              data: {
                workspaceId: createdWorkspace.id,
                plan: "STARTER",
                status: "free",
              },
            });

            await seedDefaultExpenseCategories(tx, createdWorkspace.id);

            return createdWorkspace;
          },
          { timeout: WORKSPACE_BOOTSTRAP_TIMEOUT_MS }
        );

        workspaceId = workspace.id;

        logLoginDebug("Bootstrapped default workspace", {
          userId: user.id,
          workspaceId,
        });
      }
    }

    const { token, expiresAt } = await createSession(user.id);

    logLoginDebug("Created session for login response", {
      userId: user.id,
      expiresAt: expiresAt.toISOString(),
      workspaceId: workspaceId ?? null,
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        createdAt: user.createdAt,
      },
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      ...buildSessionCookieOptions(expiresAt),
    });

    if (workspaceId) {
      response.cookies.set({
        name: WORKSPACE_COOKIE_NAME,
        value: String(workspaceId),
        ...buildWorkspaceCookieOptions(),
      });
    }

    return response;
  } catch (error) {
    logRouteError("/api/login", error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json(
        {
          error: "Database error during login",
          code: error.code,
          message: error.message,
        },
        { status: 400 }
      );
    }

    const details = error instanceof Error ? error.message : String(error);
    logLoginDebug("Login request failed", { details });

    return NextResponse.json(
      {
        error: "We could not log you in right now. Please try again.",
        ...((process.env.NODE_ENV !== "production" || LOGIN_DEBUG_ENABLED)
          ? { details }
          : {}),
      },
      { status: 500 }
    );
  }
}