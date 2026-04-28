"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
type Plan = "STARTER" | "GROWTH" | "PROFESSIONAL" | "ENTERPRISE" | null;

type WorkspaceSummary = {
  id: number;
  name: string;
  role: Role;
  archivedAt: string | null;
  createdAt: string;
  membersCount: number;
  invoicesCount: number;
  taxRecordsCount: number;
  plan: Plan;
  subscriptionLabel: string;
};

type Props = {
  initialWorkspaces: WorkspaceSummary[];
  activeWorkspaceId: number | null;
};

const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
};

const PLAN_LABELS: Record<Exclude<Plan, null>, string> = {
  STARTER: "Starter",
  GROWTH: "Growth",
  PROFESSIONAL: "Professional",
  ENTERPRISE: "Enterprise",
};

function canManageWorkspace(role: Role) {
  return role === "OWNER" || role === "ADMIN";
}

function formatDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function sortWorkspaces(workspaces: WorkspaceSummary[]) {
  return [...workspaces].sort((left, right) => {
    if (Boolean(left.archivedAt) !== Boolean(right.archivedAt)) {
      return left.archivedAt ? 1 : -1;
    }
    return left.name.localeCompare(right.name);
  });
}

export default function WorkspaceManagementClient({
  initialWorkspaces,
  activeWorkspaceId: initialActiveWorkspaceId,
}: Props) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState(() => sortWorkspaces(initialWorkspaces));
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(initialActiveWorkspaceId);
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [switchingId, setSwitchingId] = useState<number | null>(null);
  const [archivingId, setArchivingId] = useState<number | null>(null);

  const currentWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;

  const summary = useMemo(() => {
    return workspaces.reduce(
      (totals, workspace) => ({
        activeCount: totals.activeCount + (workspace.archivedAt ? 0 : 1),
        archivedCount: totals.archivedCount + (workspace.archivedAt ? 1 : 0),
        invoiceCount: totals.invoiceCount + workspace.invoicesCount,
        taxRecordCount: totals.taxRecordCount + workspace.taxRecordsCount,
      }),
      {
        activeCount: 0,
        archivedCount: 0,
        invoiceCount: 0,
        taxRecordCount: 0,
      }
    );
  }, [workspaces]);

  const editingWorkspace =
    workspaces.find((workspace) => workspace.id === editingWorkspaceId) ?? null;

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const trimmedName = createName.trim();
    if (!trimmedName) {
      setCreateError("Workspace name is required.");
      return;
    }

    setCreating(true);
    setCreateError(null);
    setActionError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data?.error ?? "Unable to create workspace");
        return;
      }

      setWorkspaces((current) => sortWorkspaces([data.workspace, ...current]));
      setActiveWorkspaceId(data.workspace.id);
      setCreateName("");
      setMessage("Workspace created and selected.");
      router.refresh();
    } catch {
      setCreateError("Network error creating workspace");
    } finally {
      setCreating(false);
    }
  }

  async function handleSwitch(workspace: WorkspaceSummary) {
    if (workspace.archivedAt) return;
    setSwitchingId(workspace.id);
    setActionError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/workspaces/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: workspace.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data?.error ?? "Unable to switch workspace");
        return;
      }

      setActiveWorkspaceId(workspace.id);
      setMessage(`Switched to ${workspace.name}.`);
      router.refresh();
    } catch {
      setActionError("Network error switching workspace");
    } finally {
      setSwitchingId(null);
    }
  }

  async function handleRename(event: FormEvent) {
    event.preventDefault();
    if (!editingWorkspace) return;

    const trimmedName = editingName.trim();
    if (!trimmedName) {
      setActionError("Workspace name is required.");
      return;
    }

    setSavingEdit(true);
    setActionError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/workspaces/${editingWorkspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data?.error ?? "Unable to rename workspace");
        return;
      }

      setWorkspaces((current) =>
        sortWorkspaces(
          current.map((workspace) =>
            workspace.id === editingWorkspace.id ? data.workspace : workspace
          )
        )
      );
      setEditingWorkspaceId(null);
      setEditingName("");
      setMessage("Workspace renamed.");
      router.refresh();
    } catch {
      setActionError("Network error renaming workspace");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleArchive(workspace: WorkspaceSummary) {
    if (workspace.archivedAt) return;
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            `Archive ${workspace.name}? Archived workspaces are removed from normal switching and remain read-only in the management list.`
          );
    if (!confirmed) return;

    setArchivingId(workspace.id);
    setActionError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archive: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data?.error ?? "Unable to archive workspace");
        return;
      }

      setWorkspaces((current) =>
        sortWorkspaces(
          current.map((entry) => (entry.id === workspace.id ? data.workspace : entry))
        )
      );
      if (editingWorkspaceId === workspace.id) {
        setEditingWorkspaceId(null);
        setEditingName("");
      }
      setActiveWorkspaceId((current) => {
        if (typeof data?.activeWorkspaceId === "number") {
          return data.activeWorkspaceId;
        }
        return current === workspace.id ? null : current;
      });
      setMessage(
        data?.activeWorkspaceId
          ? `${workspace.name} archived. Active workspace switched automatically.`
          : `${workspace.name} archived. No active workspace is currently selected.`
      );
      router.refresh();
    } catch {
      setActionError("Network error archiving workspace");
    } finally {
      setArchivingId(null);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Workspaces</h1>
          <p className="text-muted-foreground">
            Manage multiple businesses from one account without losing tenant boundaries.
          </p>
          <p className="text-sm text-muted-foreground">
            Current scope:{" "}
            <span className="font-medium text-foreground">
              {currentWorkspace?.name ?? "No active workspace selected"}
            </span>
          </p>
        </div>
        <Badge variant="secondary">Multi-business beta</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active workspaces</CardDescription>
            <CardTitle className="text-xl">{summary.activeCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Archived workspaces</CardDescription>
            <CardTitle className="text-xl">{summary.archivedCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total invoices</CardDescription>
            <CardTitle className="text-xl">{summary.invoiceCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total tax records</CardDescription>
            <CardTitle className="text-xl">{summary.taxRecordCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {actionError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}
      {message && (
        <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
          {message}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Create workspace</CardTitle>
          <CardDescription>
            Add another company or client environment without affecting existing records.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap gap-3" onSubmit={handleCreate}>
            <div className="grid min-w-[280px] flex-1 gap-2">
              <Label htmlFor="workspace-name">Workspace name</Label>
              <Input
                id="workspace-name"
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder="Acme Holdings"
              />
              {createError && <p className="text-sm text-destructive">{createError}</p>}
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={creating}>
                {creating ? "Creating..." : "Create workspace"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {editingWorkspace && (
        <Card>
          <CardHeader>
            <CardTitle>Rename workspace</CardTitle>
            <CardDescription>
              Update the display name for {editingWorkspace.name}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-wrap gap-3" onSubmit={handleRename}>
              <div className="grid min-w-[280px] flex-1 gap-2">
                <Label htmlFor="workspace-edit-name">Workspace name</Label>
                <Input
                  id="workspace-edit-name"
                  value={editingName}
                  onChange={(event) => setEditingName(event.target.value)}
                />
              </div>
              <div className="flex items-end gap-2">
                <Button type="submit" disabled={savingEdit}>
                  {savingEdit ? "Saving..." : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingWorkspaceId(null);
                    setEditingName("");
                  }}
                  disabled={savingEdit}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Workspace directory</CardTitle>
          <CardDescription>
            Archived workspaces are hidden from the switcher and can no longer become the active
            tenant.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {workspaces.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No workspaces yet. Create your first workspace to get started.
            </p>
          ) : (
            workspaces.map((workspace) => {
              const isActive = workspace.id === activeWorkspaceId;
              const canManage = canManageWorkspace(workspace.role) && !workspace.archivedAt;

              return (
                <div key={workspace.id} className="rounded-lg border bg-background p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold">{workspace.name}</h2>
                        {isActive && <Badge>Current</Badge>}
                        {workspace.archivedAt ? (
                          <Badge variant="outline">Archived</Badge>
                        ) : (
                          <Badge variant="secondary">{ROLE_LABELS[workspace.role]}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {workspace.subscriptionLabel}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Created {formatDate(workspace.createdAt)}
                        {workspace.archivedAt
                          ? ` · Archived ${formatDate(workspace.archivedAt)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!workspace.archivedAt && !isActive && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={switchingId === workspace.id}
                          onClick={() => handleSwitch(workspace)}
                        >
                          {switchingId === workspace.id ? "Switching..." : "Switch"}
                        </Button>
                      )}
                      {canManage && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingWorkspaceId(workspace.id);
                            setEditingName(workspace.name);
                            setActionError(null);
                            setMessage(null);
                          }}
                        >
                          Rename
                        </Button>
                      )}
                      {canManage && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={archivingId === workspace.id}
                          onClick={() => handleArchive(workspace)}
                        >
                          {archivingId === workspace.id ? "Archiving..." : "Archive"}
                        </Button>
                      )}
                      {!workspace.archivedAt && isActive && (
                        <Button variant="ghost" size="sm" asChild>
                          <Link href="/dashboard">Open dashboard</Link>
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <div className="rounded-md border px-3 py-2">
                      <div className="text-xs text-muted-foreground">Members</div>
                      <div className="text-lg font-semibold">{workspace.membersCount}</div>
                    </div>
                    <div className="rounded-md border px-3 py-2">
                      <div className="text-xs text-muted-foreground">Invoices</div>
                      <div className="text-lg font-semibold">{workspace.invoicesCount}</div>
                    </div>
                    <div className="rounded-md border px-3 py-2">
                      <div className="text-xs text-muted-foreground">Tax records</div>
                      <div className="text-lg font-semibold">{workspace.taxRecordsCount}</div>
                    </div>
                    <div className="rounded-md border px-3 py-2">
                      <div className="text-xs text-muted-foreground">Plan</div>
                      <div className="text-lg font-semibold">
                        {workspace.plan ? PLAN_LABELS[workspace.plan] : "Starter"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </section>
  );
}
