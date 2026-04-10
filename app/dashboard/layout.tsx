import { requireUser } from "@/lib/auth";
import { getWorkspaceShellState } from "@/lib/workspaces";
import { OfflineSyncProvider } from "./_components/OfflineSyncProvider";
import Sidebar from "./_components/Sidebar";
import Topbar from "./_components/Topbar";

export const runtime = "nodejs";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();
  const {
    activeMembership,
    activeWorkspaceId,
    workspaces,
    activeOnboardingConfig,
  } = await getWorkspaceShellState(user.id);
  const activeWorkspaceSummary =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;

  return (
    <OfflineSyncProvider>
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_26%),radial-gradient(circle_at_88%_8%,rgba(14,165,233,0.12),transparent_22%),radial-gradient(circle_at_bottom_left,rgba(15,23,42,0.05),transparent_28%),linear-gradient(180deg,#f8fafc_0%,#f4f7fb_42%,#eef3f9_100%)] text-slate-900">
        <Sidebar
          workspace={activeWorkspaceSummary}
          preferredModuleHrefs={activeOnboardingConfig?.preferredModuleHrefs ?? []}
        />
        <Topbar
          user={{ fullName: user.fullName, email: user.email }}
          workspace={
            activeMembership
              ? {
                  name: activeMembership.workspace.name,
                  role: activeMembership.role,
                  workspaceKind: activeWorkspaceSummary?.workspaceKind ?? "STANDARD",
                  clientBusinessCount: activeWorkspaceSummary?.clientBusinessCount ?? 0,
                  onboardingComplete: activeWorkspaceSummary?.onboardingComplete ?? false,
                }
              : null
          }
          workspaceOptions={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          preferredModuleHrefs={activeOnboardingConfig?.preferredModuleHrefs ?? []}
        />
        <main className="relative min-h-screen pt-24 md:pl-72">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[linear-gradient(180deg,rgba(255,255,255,0.78)_0%,rgba(255,255,255,0)_100%)]" />
          <div className="relative mx-auto w-full max-w-[1520px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </OfflineSyncProvider>
  );
}
