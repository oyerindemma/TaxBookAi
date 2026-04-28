import "server-only";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Prisma, WorkspaceRole } from "@prisma/client";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_DAYS,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/session-constants";
import {
  PASSWORD_MIN_LENGTH,
  normalizeEmail,
  normalizeFullName,
  validateEmail,
  validateFullName,
  validatePassword,
} from "@/lib/auth-validation";
import { getAppUrl, getOptionalSessionCookieDomain } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { WORKSPACE_COOKIE_NAME } from "@/lib/workspaces";

export { SESSION_COOKIE_NAME, SESSION_TTL_DAYS, SESSION_MAX_AGE_SECONDS };
export {
  PASSWORD_MIN_LENGTH,
  normalizeEmail,
  normalizeFullName,
  validateEmail,
  validateFullName,
  validatePassword,
};
export const PASSWORD_RESET_TOKEN_TTL_MINUTES = 60;

const PASSWORD_HASH_ROUNDS = 12;

const SESSION_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type SessionUser = Prisma.UserGetPayload<{
  select: typeof SESSION_USER_SELECT;
}>;

export function buildSessionCookieOptions(expiresAt?: Date) {
  const domain = getOptionalSessionCookieDomain();

  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    ...(domain ? { domain } : {}),
    ...(expiresAt ? { expires: expiresAt } : {}),
  };
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export async function createSession(userId: number) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await prisma.session.create({
    data: {
      tokenHash,
      userId,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export async function deleteUserSessions(userId: number) {
  await prisma.session.deleteMany({ where: { userId } });
}

export async function deleteSessionByToken(token: string) {
  const tokenHash = hashToken(token);
  await prisma.session.deleteMany({ where: { tokenHash } });
}

export async function getSessionByToken(token?: string) {
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: SESSION_USER_SELECT,
      },
    },
  });

  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } });
    return null;
  }

  return session;
}

export async function getSessionFromCookies() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return getSessionByToken(token);
}

export async function getUserFromSession() {
  const session = await getSessionFromCookies();
  return session?.user ?? null;
}

export async function redirectIfAuthenticated(pathname = "/dashboard") {
  const user = await getUserFromSession();
  if (user) {
    redirect(pathname);
  }
}

export async function requireUser() {
  const user = await getUserFromSession();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function createPasswordResetToken(userId: number) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(
    Date.now() + PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000
  );

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.deleteMany({
      where: { userId },
    });

    await tx.passwordResetToken.create({
      data: {
        tokenHash,
        userId,
        expiresAt,
      },
    });
  });

  return { token, expiresAt };
}

type PasswordResetTokenValidation =
  | { ok: true; userId: number; expiresAt: Date }
  | { ok: false; status: number; error: string };

export async function validatePasswordResetToken(
  token?: string
): Promise<PasswordResetTokenValidation> {
  const trimmedToken = token?.trim();
  if (!trimmedToken) {
    return {
      ok: false,
      status: 400,
      error: "This password reset link is missing. Request a new one.",
    };
  }

  const tokenHash = hashToken(trimmedToken);
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      usedAt: true,
    },
  });

  if (!resetToken) {
    return {
      ok: false,
      status: 400,
      error: "This password reset link is invalid. Request a new one.",
    };
  }

  if (resetToken.usedAt) {
    return {
      ok: false,
      status: 400,
      error: "This password reset link has already been used. Request a new one.",
    };
  }

  if (resetToken.expiresAt.getTime() <= Date.now()) {
    await prisma.passwordResetToken.deleteMany({
      where: { id: resetToken.id },
    });

    return {
      ok: false,
      status: 410,
      error: "This password reset link has expired. Request a new one.",
    };
  }

  return {
    ok: true,
    userId: resetToken.userId,
    expiresAt: resetToken.expiresAt,
  };
}

type ResetPasswordResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export async function resetPasswordWithToken(
  token: string,
  password: string
): Promise<ResetPasswordResult> {
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    return {
      ok: false,
      status: 400,
      error: "This password reset link is invalid. Request a new one.",
    };
  }

  const passwordHash = await hashPassword(password);
  const tokenHash = hashToken(trimmedToken);

  return prisma.$transaction(async (tx) => {
    const resetToken = await tx.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
      },
    });

    if (!resetToken) {
      return {
        ok: false,
        status: 400,
        error: "This password reset link is invalid. Request a new one.",
      } satisfies ResetPasswordResult;
    }

    if (resetToken.usedAt) {
      return {
        ok: false,
        status: 400,
        error: "This password reset link has already been used. Request a new one.",
      } satisfies ResetPasswordResult;
    }

    if (resetToken.expiresAt.getTime() <= Date.now()) {
      await tx.passwordResetToken.deleteMany({
        where: { id: resetToken.id },
      });

      return {
        ok: false,
        status: 410,
        error: "This password reset link has expired. Request a new one.",
      } satisfies ResetPasswordResult;
    }

    const consumed = await tx.passwordResetToken.updateMany({
      where: {
        id: resetToken.id,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    if (consumed.count !== 1) {
      return {
        ok: false,
        status: 409,
        error: "This password reset link is no longer valid. Request a new one.",
      } satisfies ResetPasswordResult;
    }

    await tx.user.update({
      where: { id: resetToken.userId },
      data: { password: passwordHash },
    });

    await tx.passwordResetToken.deleteMany({
      where: {
        userId: resetToken.userId,
        id: {
          not: resetToken.id,
        },
      },
    });

    await tx.session.deleteMany({
      where: { userId: resetToken.userId },
    });

    return { ok: true } satisfies ResetPasswordResult;
  });
}

export function buildPasswordResetUrl(token: string) {
  const url = new URL("/reset-password", getAppUrl());
  url.searchParams.set("token", token);
  return url.toString();
}

export async function getAuthContext() {
  const session = await getSessionFromCookies();
  if (!session) return null;

  const cookieStore = await cookies();
  const rawWorkspace = cookieStore.get(WORKSPACE_COOKIE_NAME)?.value;
  const workspaceId = rawWorkspace ? Number(rawWorkspace) : NaN;
  let membership =
    Number.isFinite(workspaceId) && Number.isInteger(workspaceId)
      ? await prisma.workspaceMember.findFirst({
          where: {
            userId: session.userId,
            workspaceId,
            workspace: {
              archivedAt: null,
            },
          },
          select: { role: true, workspaceId: true },
        })
      : null;

  if (!membership) {
    membership = await prisma.workspaceMember.findFirst({
      where: {
        userId: session.userId,
        workspace: {
          archivedAt: null,
        },
      },
      orderBy: { workspace: { name: "asc" } },
      select: { role: true, workspaceId: true },
    });
  }

  if (!membership) return null;

  return {
    userId: session.userId,
    workspaceId: membership.workspaceId,
    role: membership.role,
  };
}

export async function getWorkspaceAuth(workspaceId: number, userId?: number) {
  const resolvedUserId = userId ?? (await getSessionFromCookies())?.userId;
  if (!resolvedUserId) return null;

  const membership = await prisma.workspaceMember.findFirst({
    where: {
      userId: resolvedUserId,
      workspaceId,
      workspace: {
        archivedAt: null,
      },
    },
    select: { role: true },
  });

  if (!membership) return null;

  return {
    userId: resolvedUserId,
    workspaceId,
    role: membership.role as WorkspaceRole,
  };
}

const ROLE_ORDER: WorkspaceRole[] = ["VIEWER", "MEMBER", "ADMIN", "OWNER"];

export function isRoleAtLeast(role: WorkspaceRole, required: WorkspaceRole) {
  return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(required);
}

type RoleCheckResult =
  | { ok: true; context: { userId: number; workspaceId: number; role: WorkspaceRole } }
  | { ok: false; status: number; error: string };

export async function requireRoleAtLeast(
  workspaceId: number,
  required: WorkspaceRole
): Promise<RoleCheckResult> {
  const session = await getSessionFromCookies();
  if (!session) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: {
      userId: session.userId,
      workspaceId,
      workspace: {
        archivedAt: null,
      },
    },
    select: { role: true },
  });

  if (!membership) {
    return { ok: false, status: 404, error: "Workspace not found" };
  }

  const role = membership.role as WorkspaceRole;
  if (!isRoleAtLeast(role, required)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return {
    ok: true,
    context: { userId: session.userId, workspaceId, role },
  };
}
