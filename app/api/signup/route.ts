import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  buildSessionCookieOptions,
  createSession,
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

type SignupBody = {
  email?: unknown;
  password?: unknown;
  fullName?: unknown;
  confirmPassword?: unknown;
};

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

    const hashedPassword = await bcrypt.hash(password, 10);
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          fullName,
          role: "USER",
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          createdAt: true,
        },
      });

      const workspace = await tx.workspace.create({
        data: {
          name: `${fullName}'s Workspace`,
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

      await seedDefaultExpenseCategories(tx, workspace.id);

      return {
        user,
        workspaceId: workspace.id,
      };
    });

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

    logRouteError("/api/signup", error);

    return NextResponse.json(
      {
        error: "We could not create your account right now. Please try again.",
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
