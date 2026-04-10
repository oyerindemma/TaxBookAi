"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Download, ShieldCheck, Trash2 } from "lucide-react";
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
import {
  getComplianceAccessTierCopy,
  resolveComplianceAccessTier,
  type ComplianceWorkspaceRole,
} from "@/lib/config/compliance";

type ComplianceToolsCardProps = {
  workspaceId: number | null;
  workspaceName: string | null;
  workspaceRole: ComplianceWorkspaceRole | null;
  canArchiveWorkspace: boolean;
};

export default function ComplianceToolsCard({
  workspaceId,
  workspaceName,
  workspaceRole,
  canArchiveWorkspace,
}: ComplianceToolsCardProps) {
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"archive" | "delete-account" | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");

  const accessTier = resolveComplianceAccessTier(workspaceRole);
  const accessCopy = getComplianceAccessTierCopy(accessTier);
  const canExportWorkspace = canArchiveWorkspace && Boolean(workspaceId);

  async function archiveWorkspace() {
    if (!workspaceId || !canArchiveWorkspace) return;
    const confirmed = window.confirm(
      `Archive ${workspaceName ?? "this workspace"}? This removes it from active use but preserves audit-safe records.`
    );
    if (!confirmed) return;

    setPendingAction("archive");
    setActionError(null);
    setActionMessage(null);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ archive: true }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setActionError(data?.error ?? "Unable to archive the workspace right now.");
        return;
      }

      setActionMessage(
        "Workspace archived. Redirecting you to workspace management."
      );
      window.setTimeout(() => {
        window.location.assign("/dashboard/workspaces");
      }, 600);
    } catch {
      setActionError("Unable to archive the workspace right now.");
    } finally {
      setPendingAction(null);
    }
  }

  async function deleteAccount() {
    if (!currentPassword.trim()) {
      setActionError("Enter your current password before deleting your account.");
      setActionMessage(null);
      return;
    }

    const confirmed = window.confirm(
      "Delete your TaxBook AI account? This signs you out, removes workspace memberships, and anonymizes your profile."
    );
    if (!confirmed) return;

    setPendingAction("delete-account");
    setActionError(null);
    setActionMessage(null);

    try {
      const response = await fetch("/api/compliance/account", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string; fieldErrors?: Record<string, string> }
        | null;

      if (!response.ok) {
        setActionError(
          data?.fieldErrors?.currentPassword ??
            data?.error ??
            "Unable to delete your account right now."
        );
        return;
      }

      setActionMessage("Account deleted. Redirecting you to the homepage.");
      setCurrentPassword("");
      window.setTimeout(() => {
        window.location.assign("/");
      }, 600);
    } catch {
      setActionError("Unable to delete your account right now.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <Badge variant="secondary" className="w-fit rounded-full">
          Compliance
        </Badge>
        <div className="space-y-1">
          <CardTitle>Legal controls and data tools</CardTitle>
          <CardDescription>
            Export workspace data, review enterprise legal documents, and manage sensitive
            account actions with audit-safe controls.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-2xl border bg-muted/20 p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Operational access tier</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-full capitalize">
                  {accessCopy.label}
                </Badge>
                {workspaceRole ? (
                  <span className="text-xs text-muted-foreground">Mapped from {workspaceRole}</span>
                ) : null}
              </div>
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{accessCopy.description}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border bg-background p-4">
            <p className="text-sm font-medium text-foreground">Data export</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Download a compliance-ready JSON snapshot of your account or active workspace.
              Workspace exports are restricted to admins and owners.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <a href="/api/compliance/export?scope=account">
                  <Download className="size-4" />
                  Export account data
                </a>
              </Button>
              {canExportWorkspace ? (
                <Button asChild size="sm">
                  <a href="/api/compliance/export?scope=workspace">
                    <Download className="size-4" />
                    Export workspace data
                  </a>
                </Button>
              ) : (
                <Button size="sm" disabled>
                  <Download className="size-4" />
                  Export workspace data
                </Button>
              )}
            </div>
            {!canExportWorkspace && workspaceId ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Workspace exports require an admin or owner role on the active workspace.
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border bg-background p-4">
            <p className="text-sm font-medium text-foreground">Enterprise documents</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Keep privacy, terms, cookies, and DPA references close to workspace operations.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/privacy">Privacy</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/terms">Terms</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/cookies">Cookies</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/dpa">DPA</Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200/70 bg-amber-50/70 p-4 text-amber-950">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Sensitive actions</p>
                <p className="mt-1 text-sm text-amber-900/80">
                  Workspace deletion is handled as an archive to preserve audit-safe records.
                  Account deletion anonymizes your profile, removes workspace memberships, and now
                  requires your current password.
                </p>
              </div>
              <div className="max-w-sm space-y-2">
                <label
                  htmlFor="delete-account-current-password"
                  className="text-xs font-medium uppercase tracking-wide text-amber-900/80"
                >
                  Current password
                </label>
                <Input
                  id="delete-account-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  placeholder="Enter your current password"
                  className="border-amber-300 bg-white text-amber-950 placeholder:text-amber-800/50"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-amber-300 bg-white text-amber-950 hover:bg-amber-100"
                  disabled={!workspaceId || !canArchiveWorkspace || pendingAction === "archive"}
                  onClick={archiveWorkspace}
                >
                  <Trash2 className="size-4" />
                  {pendingAction === "archive" ? "Archiving..." : "Delete workspace"}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={pendingAction === "delete-account" || !currentPassword.trim()}
                  onClick={deleteAccount}
                >
                  <Trash2 className="size-4" />
                  {pendingAction === "delete-account" ? "Deleting..." : "Delete account"}
                </Button>
              </div>
              {!canArchiveWorkspace && workspaceId ? (
                <p className="text-xs text-amber-900/75">
                  Only workspace admins can archive the active workspace.
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {actionMessage ? <p className="text-sm text-emerald-600">{actionMessage}</p> : null}
        {actionError ? <p className="text-sm text-rose-600">{actionError}</p> : null}
      </CardContent>
    </Card>
  );
}
