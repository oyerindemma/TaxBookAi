import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getSessionFromCookies } from "@/lib/auth";
import { validateBusinessProfileInput } from "@/lib/business-profile";
import { logRouteError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";

export const runtime = "nodejs";

export async function PUT(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await getActiveWorkspaceMembership(session.userId);
  if (!membership) {
    return NextResponse.json(
      { error: "Create or select a workspace before continuing." },
      { status: 400 }
    );
  }

  if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Only workspace admins can update business settings." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { values, fieldErrors } = validateBusinessProfileInput(body ?? {});

    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json(
        {
          error: "Please correct the highlighted fields.",
          fieldErrors,
        },
        { status: 400 }
      );
    }

    const completedAt =
      membership.workspace.businessProfile?.onboardingCompletedAt ?? new Date();

    const profile = await prisma.$transaction(async (tx) => {
      const savedProfile = await tx.businessProfile.upsert({
        where: {
          workspaceId: membership.workspaceId,
        },
        create: {
          workspaceId: membership.workspaceId,
          businessName: values.businessName,
          businessType: values.businessType,
          industry: values.industry,
          country: values.country,
          state: values.state,
          taxIdentificationNumber: values.taxIdentificationNumber,
          defaultCurrency: values.defaultCurrency,
          fiscalYearStartMonth: values.fiscalYearStartMonth,
          onboardingCompletedAt: completedAt,
        },
        update: {
          businessName: values.businessName,
          businessType: values.businessType,
          industry: values.industry,
          country: values.country,
          state: values.state,
          taxIdentificationNumber: values.taxIdentificationNumber,
          defaultCurrency: values.defaultCurrency,
          fiscalYearStartMonth: values.fiscalYearStartMonth,
          onboardingCompletedAt: completedAt,
        },
      });

      await tx.workspace.update({
        where: { id: membership.workspaceId },
        data: { name: values.businessName },
      });

      return savedProfile;
    });

    await logAudit({
      workspaceId: membership.workspaceId,
      actorUserId: session.userId,
      action: membership.workspace.businessProfile?.onboardingCompletedAt
        ? "WORKSPACE_BUSINESS_PROFILE_UPDATED"
        : "WORKSPACE_ONBOARDING_COMPLETED",
      metadata: {
        businessName: profile.businessName,
        businessType: profile.businessType,
        country: profile.country,
        state: profile.state,
        fiscalYearStartMonth: profile.fiscalYearStartMonth,
      },
    });

    return NextResponse.json({
      ok: true,
      message: membership.workspace.businessProfile?.onboardingCompletedAt
        ? "Business settings updated."
        : "Workspace onboarding complete.",
      redirectTo: "/dashboard",
      profile: {
        businessName: profile.businessName,
        businessType: profile.businessType,
        industry: profile.industry,
        country: profile.country,
        state: profile.state,
        taxIdentificationNumber: profile.taxIdentificationNumber,
        defaultCurrency: profile.defaultCurrency,
        fiscalYearStartMonth: profile.fiscalYearStartMonth,
        onboardingCompletedAt: profile.onboardingCompletedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    logRouteError("business profile save failed", error, {
      workspaceId: membership.workspaceId,
      actorUserId: session.userId,
    });
    return NextResponse.json(
      { error: "We could not save your business settings right now. Please try again." },
      { status: 500 }
    );
  }
}
