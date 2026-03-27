import { requireUser } from "@/lib/auth";
import { buildFinancialHealthFallbackSnapshot, getFinancialHealthSnapshot } from "@/lib/financial-health";
import {
  buildFinancialIntegrityIssuesFallbackSnapshot,
  getFinancialIntegrityIssuesSnapshot,
} from "@/lib/financial-integrity";
import { logError } from "@/lib/logger";
import { listUserWorkspaceSummaries } from "@/lib/workspaces";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IntegrityAdminClient } from "@/app/dashboard/admin/integrity/_components/IntegrityAdminClient";

export const runtime = "nodejs";

export default async function IntegrityPage() {
  const user = await requireUser();
  const workspaces = await listUserWorkspaceSummaries(user.id);
  const adminWorkspaces = workspaces.filter(
    (workspace) =>
      !workspace.archivedAt &&
      (workspace.role === "OWNER" || workspace.role === "ADMIN")
  );

  if (adminWorkspaces.length === 0) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Integrity Control Center</h1>
          <p className="text-muted-foreground">Admin access is required.</p>
        </div>
        <Card className="rounded-2xl border border-cyan/15 bg-primary text-white shadow-glow">
          <CardHeader>
            <CardTitle className="text-white">No admin workspaces</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-300">
            You need OWNER or ADMIN access in at least one workspace to inspect and repair
            financial integrity issues.
          </CardContent>
        </Card>
      </section>
    );
  }

  const accessibleWorkspaceIds = adminWorkspaces.map((workspace) => workspace.id);
  const initialWorkspaceId = adminWorkspaces[0]?.id ?? null;
  let initialError: string | null = null;

  const [initialSnapshot, initialHealthSnapshot] = await Promise.all([
    getFinancialIntegrityIssuesSnapshot({
      accessibleWorkspaceIds,
      selectedWorkspaceId: initialWorkspaceId,
    }).catch((error) => {
      initialError = "Unable to load integrity issues right now.";
      logError("integrity-page", "Integrity issues snapshot failed to load", error, {
        userId: user.id,
        workspaceId: initialWorkspaceId,
      });

      return buildFinancialIntegrityIssuesFallbackSnapshot({
        workspaceIds: initialWorkspaceId ? [initialWorkspaceId] : accessibleWorkspaceIds,
        selectedWorkspaceId: initialWorkspaceId,
      });
    }),
    getFinancialHealthSnapshot({
      accessibleWorkspaceIds,
      selectedWorkspaceId: initialWorkspaceId,
    }).catch((error) => {
      logError("integrity-page", "Financial health snapshot failed to load", error, {
        userId: user.id,
        workspaceId: initialWorkspaceId,
      });

      return buildFinancialHealthFallbackSnapshot({
        workspaceIds: initialWorkspaceId ? [initialWorkspaceId] : accessibleWorkspaceIds,
        selectedWorkspaceId: initialWorkspaceId,
        topDeductions: [
          {
            key: "integrity_page_health_unavailable",
            label: "Financial health data is temporarily unavailable",
            points: 0,
          },
        ],
      });
    }),
  ]);

  return (
    <IntegrityAdminClient
      initialSnapshot={initialSnapshot}
      initialHealthSnapshot={initialHealthSnapshot}
      initialError={initialError}
      workspaceOptions={adminWorkspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
      }))}
    />
  );
}
