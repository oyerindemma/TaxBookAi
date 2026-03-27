"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import ClientRecordForm, {
  EMPTY_CLIENT_FORM_VALUES,
  type ClientRecordFormValues,
} from "./ClientRecordForm";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

type Client = {
  id: number;
  name: string;
  companyName: string | null;
  displayName: string;
  email: string;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  invoiceCount: number;
  totalBilled: number;
  totalPaid: number;
  outstandingBalance: number;
};

type Props = {
  role: Role;
  workspaceName: string;
};

function formatAmount(amountKobo: number) {
  return `NGN ${(amountKobo / 100).toFixed(2)}`;
}

function toFormValues(client: Client): ClientRecordFormValues {
  return {
    name: client.name,
    companyName: client.companyName ?? "",
    email: client.email,
    phone: client.phone ?? "",
    address: client.address ?? "",
    taxId: client.taxId ?? "",
    notes: client.notes ?? "",
  };
}

export default function ClientsClient({ role, workspaceName }: Props) {
  const canEdit = role === "OWNER" || role === "ADMIN" || role === "MEMBER";
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [createFormVersion, setCreateFormVersion] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function loadClients() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/clients", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error ?? "Unable to load clients");
        }
        if (mounted) {
          setClients(Array.isArray(data?.clients) ? data.clients : []);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Network error";
        if (mounted) setError(message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadClients();
    return () => {
      mounted = false;
    };
  }, []);

  const editingClient = useMemo(
    () => clients.find((client) => client.id === editingClientId) ?? null,
    [clients, editingClientId]
  );

  const summary = useMemo(() => {
    return clients.reduce(
      (totals, client) => ({
        totalBilled: totals.totalBilled + client.totalBilled,
        totalPaid: totals.totalPaid + client.totalPaid,
        outstandingBalance: totals.outstandingBalance + client.outstandingBalance,
      }),
      { totalBilled: 0, totalPaid: 0, outstandingBalance: 0 }
    );
  }, [clients]);

  async function handleCreate(values: ClientRecordFormValues) {
    if (!canEdit) return;
    setCreateError(null);
    setSavingCreate(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data?.error ?? "Unable to create client");
        return;
      }

      setClients((current) =>
        [data.client, ...current].sort((a, b) =>
          a.displayName.localeCompare(b.displayName)
        )
      );
      setCreateFormVersion((current) => current + 1);
    } catch {
      setCreateError("Network error creating client");
    } finally {
      setSavingCreate(false);
    }
  }

  async function handleUpdate(values: ClientRecordFormValues) {
    if (!canEdit || !editingClient) return;
    setEditError(null);
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/clients/${editingClient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data?.error ?? "Unable to update client");
        return;
      }

      setClients((current) =>
        current
          .map((client) => (client.id === editingClient.id ? data.client : client))
          .sort((a, b) => a.displayName.localeCompare(b.displayName))
      );
      setEditingClientId(null);
    } catch {
      setEditError("Network error updating client");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(client: Client) {
    if (!canEdit) return;
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(`Delete ${client.displayName}? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingId(client.id);
    setError(null);

    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Unable to delete client");
        return;
      }

      setClients((current) => current.filter((entry) => entry.id !== client.id));
      if (editingClientId === client.id) {
        setEditingClientId(null);
      }
    } catch {
      setError("Network error deleting client");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Clients</h1>
          <p className="text-muted-foreground">
            Manage client records for{" "}
            <span className="font-medium text-foreground">{workspaceName}</span>.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/invoices/new">Create invoice</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total clients</CardDescription>
            <CardTitle className="text-xl">{clients.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total billed</CardDescription>
            <CardTitle className="text-xl">{formatAmount(summary.totalBilled)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total paid</CardDescription>
            <CardTitle className="text-xl">{formatAmount(summary.totalPaid)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Outstanding balance</CardDescription>
            <CardTitle className="text-xl">
              {formatAmount(summary.outstandingBalance)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <ClientRecordForm
        key={createFormVersion}
        title="Add client"
        description="Capture business contacts, tax identifiers, and notes."
        submitLabel="Save client"
        initialValues={EMPTY_CLIENT_FORM_VALUES}
        saving={savingCreate}
        error={createError}
        disabled={!canEdit}
        onSubmit={handleCreate}
      />

      {editingClient && (
        <ClientRecordForm
          key={editingClient.updatedAt}
          title={`Edit ${editingClient.displayName}`}
          description="Update the client record without affecting existing invoices."
          submitLabel="Update client"
          initialValues={toFormValues(editingClient)}
          saving={savingEdit}
          error={editError}
          disabled={!canEdit}
          onSubmit={handleUpdate}
          onCancel={() => {
            setEditingClientId(null);
            setEditError(null);
          }}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Client list</CardTitle>
          <CardDescription>
            Open any client to review invoice history and balances.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!canEdit && (
            <p className="mb-4 text-sm text-muted-foreground">
              You have view-only access to this workspace.
            </p>
          )}
          {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading clients...</p>
          ) : clients.length === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">No clients added yet.</p>
              <p className="text-xs text-muted-foreground">
                Add a client here or create one during invoice creation.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left">
                  <th className="pb-3 font-medium">Client</th>
                  <th className="pb-3 font-medium">Email</th>
                  <th className="pb-3 font-medium">Phone</th>
                  <th className="pb-3 font-medium">Tax ID</th>
                  <th className="pb-3 font-medium">Invoices</th>
                  <th className="pb-3 font-medium">Outstanding</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => {
                  const showContactName =
                    client.companyName &&
                    client.name.trim() &&
                    client.name.trim() !== client.companyName.trim();

                  return (
                    <tr key={client.id} className="border-b last:border-b-0">
                      <td className="py-3">
                        <div className="space-y-1">
                          <Link
                            href={`/dashboard/clients/${client.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {client.displayName}
                          </Link>
                          {showContactName && (
                            <p className="text-xs text-muted-foreground">
                              Contact: {client.name}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-3">{client.email}</td>
                      <td className="py-3">{client.phone ?? "-"}</td>
                      <td className="py-3">{client.taxId ?? "-"}</td>
                      <td className="py-3">{client.invoiceCount}</td>
                      <td className="py-3">
                        {formatAmount(client.outstandingBalance)}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/dashboard/clients/${client.id}`}>View</Link>
                          </Button>
                          {canEdit && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingClientId(client.id);
                                setEditError(null);
                              }}
                            >
                              Edit
                            </Button>
                          )}
                          {canEdit && client.invoiceCount === 0 ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={deletingId === client.id}
                              onClick={() => handleDelete(client)}
                            >
                              {deletingId === client.id ? "Deleting..." : "Delete"}
                            </Button>
                          ) : canEdit ? (
                            <span className="text-xs text-muted-foreground">
                              Has invoices
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
