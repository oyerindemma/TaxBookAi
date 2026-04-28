"use client";

import { useEffect, useEffectEvent, useState, type FormEvent } from "react";
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
import { Separator } from "@/components/ui/separator";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

type Member = {
  userId: number;
  fullName: string;
  email: string;
  role: Role;
  joinedAt: string;
};

type Invite = {
  id: number;
  email: string;
  role: Role;
  token: string;
  expiresAt: string;
  createdAt: string;
};

type Props = {
  workspaceId: number;
  workspaceName: string;
  role: Role;
  currentUserId: number;
};

const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
};

export default function TeamClient({
  workspaceId,
  workspaceName,
  role,
  currentUserId,
}: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("VIEWER");
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [acceptToken, setAcceptToken] = useState("");
  const [accepting, setAccepting] = useState(false);

  const canManage = role === "OWNER" || role === "ADMIN";

  const loadData = useEffectEvent(async (activeWorkspaceId: number) => {
    setLoading(true);
    setError(null);
    try {
      const membersRes = await fetch(`/api/workspaces/${activeWorkspaceId}/members`, {
        cache: "no-store",
      });
      const membersJson = await membersRes.json();
      if (!membersRes.ok) {
        throw new Error(membersJson?.error ?? "Unable to load members");
      }
      setMembers(Array.isArray(membersJson?.members) ? membersJson.members : []);

      if (canManage) {
        const invitesRes = await fetch(`/api/workspaces/${activeWorkspaceId}/invites`, {
          cache: "no-store",
        });
        const invitesJson = await invitesRes.json();
        if (!invitesRes.ok) {
          setInvites([]);
          setError(invitesJson?.error ?? "Unable to load invites");
        } else {
          setInvites(Array.isArray(invitesJson?.invites) ? invitesJson.invites : []);
        }
      } else {
        setInvites([]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      setError(message);
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    setMessage(null);
    void loadData(workspaceId);
  }, [workspaceId, canManage]);

  async function submitInvite(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Unable to create invite");
      }

      setInviteEmail("");
      setInviteRole("VIEWER");
      setMessage("Invite created.");
      setInvites((prev) => [data.invite, ...prev]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function acceptInvite(event: FormEvent) {
    event.preventDefault();
    if (!acceptToken.trim()) {
      setError("Invite token is required.");
      return;
    }

    setAccepting(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: acceptToken.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Unable to accept invite");
      }

      setMessage("Invite accepted. Workspace switched.");
      setAcceptToken("");
      window.location.assign("/dashboard/team");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      setError(message);
    } finally {
      setAccepting(false);
    }
  }

  async function updateRole(userId: number, nextRole: Role) {
    if (!canManage) return;
    setUpdatingId(userId);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: nextRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Unable to update role");
      }

      setMembers((prev) =>
        prev.map((member) =>
          member.userId === userId ? { ...member, role: nextRole } : member
        )
      );
      setMessage("Role updated.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      setError(message);
    } finally {
      setUpdatingId(null);
    }
  }

  async function removeMember(userId: number) {
    if (!canManage) return;
    if (!window.confirm("Remove this member from the workspace?")) return;

    setRemovingId(userId);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members/${userId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Unable to remove member");
      }

      setMembers((prev) => prev.filter((member) => member.userId !== userId));
      setMessage("Member removed.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      setError(message);
    } finally {
      setRemovingId(null);
    }
  }

  async function copyToken(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      setMessage("Invite token copied.");
    } catch {
      setError("Unable to copy token. You can copy it manually.");
    }
  }

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="text-muted-foreground">
          Workspace: <span className="font-medium text-foreground">{workspaceName}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Your role: <span className="font-medium text-foreground">{ROLE_LABELS[role]}</span>
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Invite a teammate</CardTitle>
          <CardDescription>Send an invite token to a colleague.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canManage ? (
            <p className="text-sm text-muted-foreground">
              You can view members, but only owners or admins can invite.
            </p>
          ) : (
            <form onSubmit={submitInvite} className="grid gap-4 max-w-md">
              <div className="grid gap-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  type="email"
                  required
                  placeholder="member@company.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="invite-role">Role</Label>
                <select
                  id="invite-role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as Role)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="VIEWER">Viewer</option>
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                  {role === "OWNER" && <option value="OWNER">Owner</option>}
                </select>
              </div>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Sending..." : "Create invite"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accept invite</CardTitle>
          <CardDescription>Paste an invite token to join a workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={acceptInvite} className="grid gap-4 max-w-md">
            <div className="grid gap-2">
              <Label htmlFor="invite-token">Invite token</Label>
              <Input
                id="invite-token"
                value={acceptToken}
                onChange={(e) => setAcceptToken(e.target.value)}
                placeholder="Paste invite token"
              />
            </div>
            <Button type="submit" disabled={accepting} variant="secondary">
              {accepting ? "Joining..." : "Accept invite"}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">
            Accepting an invite switches your active workspace to the invitation workspace.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending invites</CardTitle>
          <CardDescription>Tokens that have not been accepted yet.</CardDescription>
        </CardHeader>
        <CardContent>
          {!canManage ? (
            <p className="text-sm text-muted-foreground">
              Pending invites are visible to owners and admins.
            </p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Loading invites...</p>
          ) : invites.length === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">No pending invites.</p>
              <p className="text-xs text-muted-foreground">
                Invite a teammate to start collaborating.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left">
                  <th className="pb-3 font-medium">Email</th>
                  <th className="pb-3 font-medium">Role</th>
                  <th className="pb-3 font-medium">Expires</th>
                  <th className="pb-3 font-medium">Token</th>
                  <th className="pb-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => (
                  <tr key={invite.id} className="border-b last:border-b-0">
                    <td className="py-3">{invite.email}</td>
                    <td className="py-3">
                      <Badge variant="secondary">{ROLE_LABELS[invite.role]}</Badge>
                    </td>
                    <td className="py-3">
                      {new Date(invite.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 font-mono text-xs">
                      {invite.token.slice(0, 12)}...
                    </td>
                    <td className="py-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => copyToken(invite.token)}
                      >
                        Copy
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>People with access to this workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading members...</p>
          ) : members.length === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">No members yet.</p>
              {canManage && (
                <p className="text-xs text-muted-foreground">
                  Send an invite to get your team collaborating.
                </p>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left">
                  <th className="pb-3 font-medium">Name</th>
                  <th className="pb-3 font-medium">Email</th>
                  <th className="pb-3 font-medium">Role</th>
                  <th className="pb-3 font-medium">Joined</th>
                  {canManage && <th className="pb-3 font-medium"></th>}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.userId} className="border-b last:border-b-0">
                    <td className="py-3">{member.fullName}</td>
                    <td className="py-3">{member.email}</td>
                    <td className="py-3">
                      {canManage ? (
                        <select
                          value={member.role}
                          onChange={(event) =>
                            updateRole(member.userId, event.target.value as Role)
                          }
                          disabled={updatingId === member.userId}
                          className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="VIEWER">Viewer</option>
                          <option value="MEMBER">Member</option>
                          <option value="ADMIN">Admin</option>
                          {role === "OWNER" && <option value="OWNER">Owner</option>}
                        </select>
                      ) : (
                        <Badge variant="secondary">{ROLE_LABELS[member.role]}</Badge>
                      )}
                    </td>
                    <td className="py-3">
                      {new Date(member.joinedAt).toLocaleDateString()}
                    </td>
                    {canManage && (
                      <td className="py-3">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={
                            removingId === member.userId ||
                            member.userId === currentUserId
                          }
                          onClick={() => removeMember(member.userId)}
                        >
                          {member.userId === currentUserId
                            ? "You"
                            : removingId === member.userId
                            ? "Removing..."
                            : "Remove"}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Separator />
      {!canManage && (
        <p className="text-xs text-muted-foreground">
          Ask an admin or owner if you need access to invite or manage members.
        </p>
      )}
    </section>
  );
}
