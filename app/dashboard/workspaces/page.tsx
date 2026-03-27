import { requireUser } from "@/lib/auth";
import {
  getActiveWorkspaceMembership,
  listUserWorkspaceSummaries,
} from "@/lib/workspaces";
import WorkspaceManagementClient from "./_components/WorkspaceManagementClient";

export default async function WorkspacesPage() {
  const user = await requireUser();
  const [activeMembership, workspaces] = await Promise.all([
    getActiveWorkspaceMembership(user.id),
    listUserWorkspaceSummaries(user.id),
  ]);

  return (
    <WorkspaceManagementClient
      activeWorkspaceId={activeMembership?.workspaceId ?? null}
      initialWorkspaces={workspaces.map((workspace) => ({
        ...workspace,
        archivedAt: workspace.archivedAt?.toISOString() ?? null,
        createdAt: workspace.createdAt.toISOString(),
      }))}
    />
  );
}
