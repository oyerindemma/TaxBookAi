"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import ClientRecordForm, {
  type ClientRecordFormValues,
} from "../../_components/ClientRecordForm";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

type ClientDetailSummary = {
  id: number;
  name: string;
  companyName: string | null;
  displayName: string;
  email: string;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  notes: string | null;
  invoiceCount: number;
};

type Props = {
  role: Role;
  client: ClientDetailSummary;
};

function toFormValues(client: ClientDetailSummary): ClientRecordFormValues {
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

export default function ClientDetailActions({ role, client }: Props) {
  const router = useRouter();
  const canEdit = role === "OWNER" || role === "ADMIN" || role === "MEMBER";
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpdate(values: ClientRecordFormValues) {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Unable to update client");
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("Network error updating client");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!canEdit) return;
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(`Delete ${client.displayName}? This cannot be undone.`);
    if (!confirmed) return;

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${client.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Unable to delete client");
        return;
      }
      router.push("/dashboard/clients");
      router.refresh();
    } catch {
      setError("Network error deleting client");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href="/dashboard/clients">Back to clients</Link>
        </Button>
        <Button asChild>
          <Link href="/dashboard/invoices/new">Create invoice</Link>
        </Button>
        {canEdit && (
          <Button
            variant={editing ? "secondary" : "outline"}
            onClick={() => {
              setEditing((current) => !current);
              setError(null);
            }}
          >
            {editing ? "Close editor" : "Edit client"}
          </Button>
        )}
        {canEdit && client.invoiceCount === 0 && (
          <Button variant="ghost" disabled={deleting} onClick={handleDelete}>
            {deleting ? "Deleting..." : "Delete client"}
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {canEdit && client.invoiceCount > 0 && !editing && (
        <p className="text-sm text-muted-foreground">
          Clients with invoice history cannot be deleted.
        </p>
      )}

      {canEdit && editing && (
        <ClientRecordForm
          key={client.id}
          title={`Edit ${client.displayName}`}
          description="Update the client record while keeping invoice history intact."
          submitLabel="Update client"
          initialValues={toFormValues(client)}
          saving={saving}
          error={error}
          onSubmit={handleUpdate}
          onCancel={() => {
            setEditing(false);
            setError(null);
          }}
        />
      )}
    </div>
  );
}
