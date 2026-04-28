import "server-only";

import { logAudit } from "@/lib/audit";
import { buildComplianceExportSnapshot } from "@/lib/compliance-data-tools";

export type ComplianceExportScope = "workspace" | "account";

export type ComplianceExportPayload = {
  scope: ComplianceExportScope;
  workspaceId: number | null;
  filename: string;
  contentType: "application/json; charset=utf-8";
  body: string;
  completedAt: string;
};

export function buildComplianceExportFilename(scope: ComplianceExportScope) {
  const date = new Date().toISOString().slice(0, 10);
  return `taxbook-${scope}-export-${date}.json`;
}

export async function buildComplianceExportPayload(input: {
  userId: number;
  scope: ComplianceExportScope;
  workspaceId?: number | null;
  processingMode?: "sync" | "async";
}): Promise<ComplianceExportPayload> {
  const workspaceId = input.scope === "workspace" ? input.workspaceId ?? null : null;
  const snapshot = await buildComplianceExportSnapshot({
    userId: input.userId,
    scope: input.scope,
    workspaceId,
  });

  if (input.scope === "workspace" && workspaceId) {
    await logAudit({
      workspaceId,
      actorUserId: input.userId,
      action: "COMPLIANCE_DATA_EXPORTED",
      metadata: {
        scope: input.scope,
        processingMode: input.processingMode ?? "sync",
      },
    });
  }

  return {
    scope: input.scope,
    workspaceId,
    filename: buildComplianceExportFilename(input.scope),
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(snapshot, null, 2),
    completedAt: new Date().toISOString(),
  };
}
