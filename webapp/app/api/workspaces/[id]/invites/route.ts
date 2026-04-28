import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRoleAtLeast } from "@/lib/auth";
import { enforceMemberLimit, getWorkspaceFeatureAccess } from "@/lib/billing";
import { logRouteError } from "@/lib/logger";

export const runtime = "nodejs";

const ROLES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;
type WorkspaceRole = (typeof ROLES)[number];
const INVITE_TTL_DAYS = 7;
type RouteContext = { params: Promise<{ id?: string }> };

function parseId(raw?: string) {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

function buildToken() {
  return crypto.randomBytes(24).toString("hex");
}

function inviteResponse(invite: {
  id: number;
  email: string;
  role: WorkspaceRole;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}) {
  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    token: invite.token,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
  };
}

export async function GET(
  _req: Request,
  context: RouteContext
) {
  const { id } = await context.params;
  const workspaceId = parseId(id);
  if (!workspaceId) {
    return NextResponse.json({ error: "Invalid workspace id" }, { status: 400 });
  }

  const auth = await requireRoleAtLeast(workspaceId, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const featureAccess = await getWorkspaceFeatureAccess(workspaceId, "TEAM_COLLABORATION");
  if (!featureAccess.ok) {
    return NextResponse.json(
      { error: featureAccess.error, currentPlan: featureAccess.plan, requiredPlan: featureAccess.requiredPlan },
      { status: 402 }
    );
  }

  const now = new Date();
  const invites = await prisma.invite.findMany({
    where: {
      workspaceId,
      acceptedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ invites: invites.map(inviteResponse) });
}

export async function POST(
  req: Request,
  context: RouteContext
) {
  const { id } = await context.params;
  const workspaceId = parseId(id);
  if (!workspaceId) {
    return NextResponse.json({ error: "Invalid workspace id" }, { status: 400 });
  }

  const auth = await requireRoleAtLeast(workspaceId, "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const featureAccess = await getWorkspaceFeatureAccess(workspaceId, "TEAM_COLLABORATION");
  if (!featureAccess.ok) {
    return NextResponse.json(
      { error: featureAccess.error, currentPlan: featureAccess.plan, requiredPlan: featureAccess.requiredPlan },
      { status: 402 }
    );
  }

  try {
    const body = await req.json();
    const { email, role } = body as { email?: string; role?: WorkspaceRole };
    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const normalizedRole = role ?? "VIEWER";
    if (!ROLES.includes(normalizedRole)) {
      return NextResponse.json({ error: "role is invalid" }, { status: 400 });
    }

    if (normalizedRole === "OWNER" && auth.context.role !== "OWNER") {
      return NextResponse.json(
        { error: "Only owners can invite owners" },
        { status: 403 }
      );
    }

    const limitCheck = await enforceMemberLimit(workspaceId, 1, true);
    if (!limitCheck.ok) {
      return NextResponse.json({ error: limitCheck.error }, { status: 402 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existingUser) {
      const membership = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: existingUser.id },
      });
      if (membership) {
        return NextResponse.json(
          { error: "User is already a member" },
          { status: 400 }
        );
      }
    }

    await prisma.invite.deleteMany({
      where: { workspaceId, email: normalizedEmail, acceptedAt: null },
    });

    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    const invite = await prisma.invite.create({
      data: {
        workspaceId,
        email: normalizedEmail,
        role: normalizedRole,
        token: buildToken(),
        expiresAt,
      },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId,
        actorUserId: auth.context.userId,
        action: "INVITE_CREATED",
        metadata: JSON.stringify({ email: normalizedEmail, role: normalizedRole }),
      },
    });

    return NextResponse.json({ invite: inviteResponse(invite) }, { status: 201 });
  } catch (error) {
    logRouteError("workspace invite create failed", error, {
      workspaceId,
      actorUserId: auth.context.userId,
    });
    return NextResponse.json(
      { error: "Server error creating invite" },
      { status: 500 }
    );
  }
}
