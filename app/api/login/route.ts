import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import {
  buildSessionCookieOptions,
  createSession,
  normalizeEmail,
  SESSION_COOKIE_NAME,
  validateEmail,
} from "@/lib/auth";
import { seedDefaultExpenseCategories } from "@/lib/expense-categories";
import { logRouteError } from "@/lib/logger";
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

    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const passwordMatches = await bcrypt.compare(inputPassword, user.password);
    if (!passwordMatches) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const { token, expiresAt } = await createSession(user.id);

    const membership = await prisma.workspaceMember.findFirst({
      where: {
        userId: user.id,
        workspace: {
          archivedAt: null,
        },
      },
      orderBy: { workspace: { name: "asc" } },
      select: { workspaceId: true },
    });

    let workspaceId = membership?.workspaceId;

    if (!workspaceId) {
      const totalMemberships = await prisma.workspaceMember.count({
        where: { userId: user.id },
      });

      if (totalMemberships === 0) {
        const workspace = await prisma.$transaction(async (tx) => {
          const createdWorkspace = await tx.workspace.create({
            data: {
              name: `${user.fullName}'s Workspace`,
              members: {
                create: {
                  userId: user.id,
                  role: "OWNER",
                },
              },
              subscription: {
                create: {
                  plan: "STARTER",
                  status: "free",
                },
              },
            },
            select: { id: true },
          });

          await seedDefaultExpenseCategories(tx, createdWorkspace.id);

          return createdWorkspace;
        });

        workspaceId = workspace.id;
      }
    }

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

    return NextResponse.json(
      {
        error: "We could not log you in right now. Please try again.",
        ...(process.env.NODE_ENV !== "production"
          ? {
              details: error instanceof Error ? error.message : String(error),
            }
          : {}),
      },
      { status: 500 }
    );
  }
}
