import { NextResponse } from "next/server";
import { clearAuthCookies, createAuthJsonResponse } from "@/lib/auth-api";
import { getSessionFromCookies, verifyPassword } from "@/lib/auth";
import { anonymizeUserAccount } from "@/lib/compliance-data-tools";
import { logRouteError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type DeleteAccountBody = {
  currentPassword?: unknown;
};

async function readBody(req: Request): Promise<DeleteAccountBody> {
  try {
    return (await req.json()) as DeleteAccountBody;
  } catch {
    return {};
  }
}

export async function DELETE(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await readBody(req);
    const currentPassword =
      typeof body.currentPassword === "string" ? body.currentPassword : "";

    if (!currentPassword.trim()) {
      return NextResponse.json(
        {
          error: "Enter your current password to delete this account.",
          fieldErrors: {
            currentPassword: "Enter your current password to continue.",
          },
        },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        password: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const passwordMatches = await verifyPassword(currentPassword, user.password);
    if (!passwordMatches) {
      return NextResponse.json(
        {
          error: "Your current password is incorrect.",
          fieldErrors: {
            currentPassword: "Your current password is incorrect.",
          },
        },
        { status: 401 }
      );
    }

    const result = await anonymizeUserAccount({
      userId: user.id,
    });

    const response = createAuthJsonResponse({
      ok: true,
      removedWorkspaceMemberships: result.removedWorkspaceMemberships,
    });
    clearAuthCookies(response);
    return response;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "We could not delete this account right now.";

    if (
      error instanceof Error &&
      /Archive or transfer any active owned workspaces/i.test(error.message)
    ) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    logRouteError("account deletion failed", error, {
      userId: session.userId,
    });
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
