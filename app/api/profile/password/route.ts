import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSessionFromCookies,
  hashPassword,
  validatePassword,
  verifyPassword,
} from "@/lib/auth";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { oldPassword, newPassword } = body as {
      oldPassword?: string;
      newPassword?: string;
    };

    const fieldErrors: Record<string, string> = {};

    if (!oldPassword) {
      fieldErrors.oldPassword = "Enter your current password.";
    }

    const newPasswordError = validatePassword(newPassword ?? "");
    if (newPasswordError) {
      fieldErrors.newPassword = newPasswordError;
    }

    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json(
        { error: "Please correct the highlighted fields.", fieldErrors },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, password: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const passwordMatches = await verifyPassword(oldPassword ?? "", user.password);
    if (!passwordMatches) {
      return NextResponse.json(
        {
          error: "Your current password is incorrect.",
          fieldErrors: {
            oldPassword: "Your current password is incorrect.",
          },
        },
        { status: 401 }
      );
    }

    const passwordHash = await hashPassword(newPassword ?? "");
    await prisma.user.update({
      where: { id: user.id },
      data: { password: passwordHash },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logRouteError("password update failed", error, { userId: session.userId });
    return NextResponse.json(
      { error: "Server error updating password" },
      { status: 500 }
    );
  }
}
