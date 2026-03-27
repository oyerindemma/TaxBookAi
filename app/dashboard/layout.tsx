import { requireUser } from "@/lib/auth";
import { getWorkspaceShellState } from "@/lib/workspaces";
import Sidebar from "./_components/Sidebar";
import Topbar from "./_components/Topbar";

export const runtime = "nodejs";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();
  const { activeMembership, activeWorkspaceId, workspaces } = await getWorkspaceShellState(
    user.id
  );

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#f4f7fb_100%)] text-slate-900">
      <Sidebar />
      <Topbar
        user={{ fullName: user.fullName, email: user.email }}
        workspace={
          activeMembership
            ? {
                name: activeMembership.workspace.name,
                role: activeMembership.role,
              }
            : null
        }
        workspaceOptions={workspaces}
        activeWorkspaceId={activeWorkspaceId}
      />
      <main className="min-h-screen pt-24 md:pl-72">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
