import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromSession } from "@/lib/auth";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

export async function PATCH(req: Request) {
  const user = await getUserFromSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { email, fullName } = body as {
      email?: string;
      fullName?: string;
    };

    const updates: { email?: string; fullName?: string } = {};

    if (email !== undefined) {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail || !normalizedEmail.includes("@")) {
        return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
      }

      if (normalizedEmail !== user.email) {
        const existing = await prisma.user.findUnique({
          where: { email: normalizedEmail },
          select: { id: true },
        });
        if (existing && existing.id !== user.id) {
          return NextResponse.json({ error: "Email already in use" }, { status: 409 });
        }
        updates.email = normalizedEmail;
      }
    }

    if (fullName !== undefined) {
      const normalizedName = fullName.trim();
      if (!normalizedName) {
        return NextResponse.json({ error: "Full name is required" }, { status: 400 });
      }
      updates.fullName = normalizedName;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No changes to update" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: updates,
    });

    return NextResponse.json({
      user: {
        id: updated.id,
        email: updated.email,
        fullName: updated.fullName,
        role: updated.role,
      },
    });
  } catch (error) {
    logRouteError("profile update failed", error, { userId: user.id });
    return NextResponse.json(
      { error: "Server error updating profile" },
      { status: 500 }
    );
  }
}
