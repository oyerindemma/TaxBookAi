import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getSessionFromCookies } from "@/lib/auth";
import { logRouteError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  buildWorkspaceOnboardingDashboardConfig,
  buildWorkspaceOnboardingSnapshot,
  createWorkspaceOnboardingDefaults,
  normalizeWorkspaceOnboardingInput,
  resolveWorkspaceOnboardingStep,
  type WorkspaceOnboardingFormValues,
  validateWorkspaceOnboardingCompletion,
} from "@/lib/workspace-onboarding";
import { getActiveWorkspaceMembership } from "@/lib/workspaces";

export const runtime = "nodejs";

function buildOnboardingResponse(input: {
  workspaceName: string;
  onboarding?: Parameters<typeof buildWorkspaceOnboardingSnapshot>[0]["onboarding"];
  businessProfile?: Parameters<typeof buildWorkspaceOnboardingSnapshot>[0]["businessProfile"];
}) {
  const onboarding = buildWorkspaceOnboardingSnapshot({
    workspaceName: input.workspaceName,
    onboarding: input.onboarding,
    businessProfile: input.businessProfile,
  });

  return {
    onboarding,
    dashboardConfig: buildWorkspaceOnboardingDashboardConfig({
      workspaceName: input.workspaceName,
      values: onboarding.values,
    }),
  };
}

export async function GET() {
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

  const canEdit = membership.role === "OWNER" || membership.role === "ADMIN";

  return NextResponse.json({
    ok: true,
    canEdit,
    ...buildOnboardingResponse({
      workspaceName: membership.workspace.name,
      onboarding: membership.workspace.onboardingProfile,
      businessProfile: membership.workspace.businessProfile,
    }),
  });
}

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
      { error: "Only workspace admins can update onboarding setup." },
      { status: 403 }
    );
  }

  try {
    const body = (await req.json()) as {
      action?: "save_draft" | "complete";
      values?: Partial<WorkspaceOnboardingFormValues>;
      currentStep?: string;
    };
    const action = body?.action;

    if (action !== "save_draft" && action !== "complete") {
      return NextResponse.json(
        { error: "Select a valid onboarding action." },
        { status: 400 }
      );
    }

    const rawValues = createWorkspaceOnboardingDefaults({
      ...(body?.values ?? {}),
      currentStep: resolveWorkspaceOnboardingStep(
        typeof body?.currentStep === "string"
          ? body.currentStep
          : body?.values?.currentStep
      ),
    });

    if (action === "complete") {
      const { values, fieldErrors } = validateWorkspaceOnboardingCompletion(rawValues);

      if (Object.keys(fieldErrors).length > 0) {
        return NextResponse.json(
          {
            error: "Please complete the remaining questions.",
            fieldErrors,
          },
          { status: 400 }
        );
      }

      const completedAt =
        membership.workspace.onboardingProfile?.completedAt ??
        membership.workspace.businessProfile?.onboardingCompletedAt ??
        new Date();
      const draftSavedAt = new Date();

      const saved = await prisma.$transaction(async (tx) => {
        const onboarding = await tx.workspaceOnboarding.upsert({
          where: {
            workspaceId: membership.workspaceId,
          },
          create: {
            workspaceId: membership.workspaceId,
            status: "COMPLETED",
            userType: values.userType,
            businessName: values.businessName,
            businessType: values.businessType,
            industry: values.industry,
            country: values.country,
            state: values.state,
            taxIdentificationNumber: values.taxIdentificationNumber,
            defaultCurrency: values.defaultCurrency,
            fiscalYearStartMonth: values.fiscalYearStartMonth,
            vatApplicability: values.vatApplicability,
            whtApplicability: values.whtApplicability,
            multiBusinessNeed: values.multiBusinessNeed,
            currentStep: values.currentStep,
            draftSavedAt,
            completedAt,
          },
          update: {
            status: "COMPLETED",
            userType: values.userType,
            businessName: values.businessName,
            businessType: values.businessType,
            industry: values.industry,
            country: values.country,
            state: values.state,
            taxIdentificationNumber: values.taxIdentificationNumber,
            defaultCurrency: values.defaultCurrency,
            fiscalYearStartMonth: values.fiscalYearStartMonth,
            vatApplicability: values.vatApplicability,
            whtApplicability: values.whtApplicability,
            multiBusinessNeed: values.multiBusinessNeed,
            currentStep: values.currentStep,
            draftSavedAt,
            completedAt,
          },
        });

        const businessProfile = await tx.businessProfile.upsert({
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

        return {
          onboarding,
          businessProfile,
        };
      });

      await logAudit({
        workspaceId: membership.workspaceId,
        actorUserId: session.userId,
        action: membership.workspace.onboardingProfile?.completedAt
          ? "WORKSPACE_ONBOARDING_UPDATED"
          : "WORKSPACE_ONBOARDING_COMPLETED",
        metadata: {
          userType: saved.onboarding.userType,
          businessType: saved.onboarding.businessType,
          industry: saved.onboarding.industry,
          vatApplicability: saved.onboarding.vatApplicability,
          whtApplicability: saved.onboarding.whtApplicability,
          multiBusinessNeed: saved.onboarding.multiBusinessNeed,
        },
      });

      return NextResponse.json({
        ok: true,
        message: "Setup complete. Your TaxBook dashboard is ready.",
        redirectTo: "/dashboard",
        ...buildOnboardingResponse({
          workspaceName: saved.businessProfile.businessName,
          onboarding: saved.onboarding,
          businessProfile: saved.businessProfile,
        }),
      });
    }

    const values = normalizeWorkspaceOnboardingInput(rawValues);
    const draftSavedAt = new Date();
    const savedOnboarding = await prisma.workspaceOnboarding.upsert({
      where: {
        workspaceId: membership.workspaceId,
      },
      create: {
        workspaceId: membership.workspaceId,
        status: membership.workspace.onboardingProfile?.completedAt ? "COMPLETED" : "IN_PROGRESS",
        userType: values.userType,
        businessName: values.businessName || null,
        businessType: values.businessType || null,
        industry: values.industry || null,
        country: values.country,
        state: values.state || null,
        taxIdentificationNumber: values.taxIdentificationNumber,
        defaultCurrency: values.defaultCurrency,
        fiscalYearStartMonth: values.fiscalYearStartMonth,
        vatApplicability: values.vatApplicability,
        whtApplicability: values.whtApplicability,
        multiBusinessNeed: values.multiBusinessNeed,
        currentStep: values.currentStep,
        draftSavedAt,
        completedAt: membership.workspace.onboardingProfile?.completedAt ?? null,
      },
      update: {
        status: membership.workspace.onboardingProfile?.completedAt ? "COMPLETED" : "IN_PROGRESS",
        userType: values.userType,
        businessName: values.businessName || null,
        businessType: values.businessType || null,
        industry: values.industry || null,
        country: values.country,
        state: values.state || null,
        taxIdentificationNumber: values.taxIdentificationNumber,
        defaultCurrency: values.defaultCurrency,
        fiscalYearStartMonth: values.fiscalYearStartMonth,
        vatApplicability: values.vatApplicability,
        whtApplicability: values.whtApplicability,
        multiBusinessNeed: values.multiBusinessNeed,
        currentStep: values.currentStep,
        draftSavedAt,
      },
    });

    await logAudit({
      workspaceId: membership.workspaceId,
      actorUserId: session.userId,
      action: "WORKSPACE_ONBOARDING_DRAFT_SAVED",
      metadata: {
        currentStep: savedOnboarding.currentStep,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Saved. You can come back and continue anytime.",
      ...buildOnboardingResponse({
        workspaceName:
          savedOnboarding.businessName ??
          membership.workspace.businessProfile?.businessName ??
          membership.workspace.name,
        onboarding: savedOnboarding,
        businessProfile: membership.workspace.businessProfile,
      }),
    });
  } catch (error) {
    logRouteError("workspace onboarding save failed", error, {
      workspaceId: membership.workspaceId,
      actorUserId: session.userId,
    });
    return NextResponse.json(
      { error: "We could not save your onboarding setup right now. Please try again." },
      { status: 500 }
    );
  }
}
