"use client";

import Link from "next/link";
import { useState } from "react";
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
import type { WhatsAppSettingsState } from "@/lib/whatsapp-receipt-types";

type Props = {
  workspaceName: string;
  initialState: WhatsAppSettingsState;
};

const selectClassName =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalFormString(formData: FormData, key: string) {
  const value = readFormString(formData, key);
  return value || null;
}

function readCheckbox(formData: FormData, key: string, fallback = false) {
  return formData.has(key) ? formData.get(key) === "on" : fallback;
}

function connectionStatusVariant(status: string) {
  if (status === "ACTIVE") return "secondary";
  if (status === "PAUSED") return "outline";
  return "destructive";
}

function messageStatusVariant(status: string) {
  if (status === "PROCESSED") return "secondary";
  if (status === "IGNORED") return "outline";
  if (status === "PROCESSING") return "default";
  return "destructive";
}

function providerLabel(provider: string) {
  return provider === "META_CLOUD_API" ? "Meta Cloud API" : "Generic webhook";
}

function formatDateTime(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

export default function WhatsAppSettingsClient({
  workspaceName,
  initialState,
}: Props) {
  const [state, setState] = useState(initialState);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function refreshState() {
    const res = await fetch("/api/settings/whatsapp", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error ?? "Failed to refresh WhatsApp settings");
    }
    setState(data);
  }

  async function mutateSettings(
    body: Record<string, unknown>,
    method: "POST" | "PATCH",
    busyLabel: string,
    successMessage: string
  ) {
    setBusyKey(busyLabel);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/settings/whatsapp", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to save WhatsApp settings");
      }

      setState(data);
      setSuccess(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleCreateConnection(formData: FormData) {
    await mutateSettings(
      {
        entity: "connection",
        label: readFormString(formData, "label"),
        provider: readFormString(formData, "provider"),
        status: readFormString(formData, "status"),
        webhookInboxKey: readOptionalFormString(formData, "webhookInboxKey"),
        phoneNumberId: readOptionalFormString(formData, "phoneNumberId"),
        displayPhoneNumber: readOptionalFormString(formData, "displayPhoneNumber"),
        defaultClientBusinessId: readOptionalFormString(formData, "defaultClientBusinessId"),
        autoProcess: readCheckbox(formData, "autoProcess", true),
      },
      "POST",
      "create-connection",
      "Connection saved."
    );
  }

  async function handleUpdateConnection(connectionId: number, formData: FormData) {
    await mutateSettings(
      {
        id: connectionId,
        entity: "connection",
        label: readFormString(formData, "label"),
        provider: readFormString(formData, "provider"),
        status: readFormString(formData, "status"),
        webhookInboxKey: readOptionalFormString(formData, "webhookInboxKey"),
        phoneNumberId: readOptionalFormString(formData, "phoneNumberId"),
        displayPhoneNumber: readOptionalFormString(formData, "displayPhoneNumber"),
        defaultClientBusinessId: readOptionalFormString(formData, "defaultClientBusinessId"),
        autoProcess: readCheckbox(formData, "autoProcess"),
      },
      "PATCH",
      `update-connection-${connectionId}`,
      "Connection updated."
    );
  }

  async function handleCreateSenderMapping(formData: FormData) {
    await mutateSettings(
      {
        entity: "senderMapping",
        connectionId: readFormString(formData, "connectionId"),
        clientBusinessId: readFormString(formData, "clientBusinessId"),
        senderPhoneNumber: readFormString(formData, "senderPhoneNumber"),
        label: readOptionalFormString(formData, "label"),
        notes: readOptionalFormString(formData, "notes"),
        active: readCheckbox(formData, "active", true),
      },
      "POST",
      "create-mapping",
      "Sender mapping saved."
    );
  }

  async function handleUpdateSenderMapping(mappingId: number, formData: FormData) {
    await mutateSettings(
      {
        id: mappingId,
        entity: "senderMapping",
        connectionId: readFormString(formData, "connectionId"),
        clientBusinessId: readFormString(formData, "clientBusinessId"),
        senderPhoneNumber: readFormString(formData, "senderPhoneNumber"),
        label: readOptionalFormString(formData, "label"),
        notes: readOptionalFormString(formData, "notes"),
        active: readCheckbox(formData, "active"),
      },
      "PATCH",
      `update-mapping-${mappingId}`,
      "Sender mapping updated."
    );
  }

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">WhatsApp receipt capture</h1>
        <p className="text-muted-foreground">
          Connect WhatsApp inboxes to {workspaceName} so inbound images and documents flow into
          the existing receipt extraction and bookkeeping review queue.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {success}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Connections</CardDescription>
            <CardTitle className="text-2xl">{state.metrics.connectionCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {state.metrics.activeConnectionCount} active inboxes
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sender mappings</CardDescription>
            <CardTitle className="text-2xl">{state.metrics.mappingCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Client-business routing rules
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Recent messages</CardDescription>
            <CardTitle className="text-2xl">{state.metrics.recentMessageCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {state.metrics.processedMessageCount} processed successfully
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failures</CardDescription>
            <CardTitle className="text-2xl">{state.metrics.failedMessageCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Review the recent message log below
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Webhook connection</CardTitle>
          <CardDescription>
            Point your WhatsApp provider to this endpoint. Incoming attachments are mapped to a
            workspace connection and then pushed into the receipt processing queue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="whatsapp-webhook-url">Webhook URL</Label>
            <div className="flex flex-col gap-2 md:flex-row">
              <Input
                id="whatsapp-webhook-url"
                value={state.runtime.webhookUrl}
                readOnly
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => navigator.clipboard.writeText(state.runtime.webhookUrl)}
              >
                Copy URL
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setBusyKey("refresh");
                  setError(null);
                  setSuccess(null);
                  refreshState()
                    .catch((err) =>
                      setError(err instanceof Error ? err.message : "Failed to refresh settings")
                    )
                    .finally(() => setBusyKey(null));
                }}
                disabled={busyKey === "refresh"}
              >
                {busyKey === "refresh" ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant={state.runtime.verifyTokenConfigured ? "secondary" : "outline"}>
              {state.runtime.verifyTokenConfigured
                ? "Verify token configured"
                : "Verify token missing"}
            </Badge>
            <Badge variant={state.runtime.webhookSecretConfigured ? "secondary" : "outline"}>
              {state.runtime.webhookSecretConfigured
                ? "Webhook secret configured"
                : "Webhook secret missing"}
            </Badge>
            <Badge variant={state.runtime.metaAccessTokenConfigured ? "secondary" : "outline"}>
              {state.runtime.metaAccessTokenConfigured
                ? "Meta access token configured"
                : "Meta access token missing"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add connection</CardTitle>
            <CardDescription>
              Create one inbound WhatsApp connection per recipient number or inbox identifier.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                handleCreateConnection(new FormData(event.currentTarget));
              }}
            >
              <div className="grid gap-2">
                <Label htmlFor="new-connection-label">Connection label</Label>
                <Input id="new-connection-label" name="label" placeholder="Lagos receipts" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="new-connection-provider">Provider</Label>
                  <select
                    id="new-connection-provider"
                    name="provider"
                    defaultValue="GENERIC_WEBHOOK"
                    className={selectClassName}
                  >
                    <option value="GENERIC_WEBHOOK">Generic webhook</option>
                    <option value="META_CLOUD_API">Meta Cloud API</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="new-connection-status">Status</Label>
                  <select
                    id="new-connection-status"
                    name="status"
                    defaultValue="ACTIVE"
                    className={selectClassName}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="PAUSED">Paused</option>
                    <option value="DISCONNECTED">Disconnected</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="new-connection-webhook-key">Webhook inbox key</Label>
                  <Input
                    id="new-connection-webhook-key"
                    name="webhookInboxKey"
                    placeholder="meta-prod-main"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="new-connection-phone-id">Phone number ID</Label>
                  <Input
                    id="new-connection-phone-id"
                    name="phoneNumberId"
                    placeholder="123456789012345"
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="new-connection-display-phone">Display phone number</Label>
                  <Input
                    id="new-connection-display-phone"
                    name="displayPhoneNumber"
                    placeholder="+234 800 000 0000"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="new-connection-business">Default client business</Label>
                  <select
                    id="new-connection-business"
                    name="defaultClientBusinessId"
                    defaultValue=""
                    className={selectClassName}
                  >
                    <option value="">Select a default business</option>
                    {state.clientBusinesses.map((business) => (
                      <option key={business.id} value={business.id}>
                        {business.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  name="autoProcess"
                  defaultChecked
                  className="h-4 w-4 rounded border-slate-300"
                />
                Auto-process incoming receipts into the review queue
              </label>
              <Button type="submit" disabled={busyKey === "create-connection"}>
                {busyKey === "create-connection" ? "Saving..." : "Save connection"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add sender mapping</CardTitle>
            <CardDescription>
              Map a WhatsApp sender to the right client business when one accountant manages
              multiple businesses.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                handleCreateSenderMapping(new FormData(event.currentTarget));
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="new-mapping-connection">Connection</Label>
                  <select
                    id="new-mapping-connection"
                    name="connectionId"
                    defaultValue=""
                    className={selectClassName}
                  >
                    <option value="">Select a connection</option>
                    {state.connections.map((connection) => (
                      <option key={connection.id} value={connection.id}>
                        {connection.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="new-mapping-business">Client business</Label>
                  <select
                    id="new-mapping-business"
                    name="clientBusinessId"
                    defaultValue=""
                    className={selectClassName}
                  >
                    <option value="">Select a client business</option>
                    {state.clientBusinesses.map((business) => (
                      <option key={business.id} value={business.id}>
                        {business.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="new-mapping-sender">Sender phone number</Label>
                  <Input
                    id="new-mapping-sender"
                    name="senderPhoneNumber"
                    placeholder="+234 801 234 5678"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="new-mapping-label">Label</Label>
                  <Input id="new-mapping-label" name="label" placeholder="ACME admin line" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="new-mapping-notes">Notes</Label>
                <textarea
                  id="new-mapping-notes"
                  name="notes"
                  rows={3}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Optional routing notes"
                />
              </div>
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked
                  className="h-4 w-4 rounded border-slate-300"
                />
                Mapping is active
              </label>
              <Button type="submit" disabled={busyKey === "create-mapping"}>
                {busyKey === "create-mapping" ? "Saving..." : "Save sender mapping"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Existing connections</CardTitle>
          <CardDescription>
            Update provider identifiers, routing defaults, and processing status for each inbox.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No connections yet. Create one above to start routing WhatsApp receipts.
            </p>
          ) : (
            state.connections.map((connection) => (
              <form
                key={`${connection.id}-${connection.updatedAt}`}
                className="space-y-4 rounded-xl border border-slate-200 p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleUpdateConnection(connection.id, new FormData(event.currentTarget));
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{connection.label}</p>
                    <Badge variant={connectionStatusVariant(connection.status)}>
                      {connection.status.replace(/_/g, " ")}
                    </Badge>
                    <Badge variant="outline">{providerLabel(connection.provider)}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Last inbound: {formatDateTime(connection.lastInboundAt)}
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Connection label</Label>
                    <Input name="label" defaultValue={connection.label} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Status</Label>
                    <select
                      name="status"
                      defaultValue={connection.status}
                      className={selectClassName}
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="PAUSED">Paused</option>
                      <option value="DISCONNECTED">Disconnected</option>
                    </select>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Provider</Label>
                    <select
                      name="provider"
                      defaultValue={connection.provider}
                      className={selectClassName}
                    >
                      <option value="GENERIC_WEBHOOK">Generic webhook</option>
                      <option value="META_CLOUD_API">Meta Cloud API</option>
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Default client business</Label>
                    <select
                      name="defaultClientBusinessId"
                      defaultValue={connection.defaultClientBusinessId ?? ""}
                      className={selectClassName}
                    >
                      <option value="">Select a default business</option>
                      {state.clientBusinesses.map((business) => (
                        <option key={business.id} value={business.id}>
                          {business.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="grid gap-2">
                    <Label>Webhook inbox key</Label>
                    <Input name="webhookInboxKey" defaultValue={connection.webhookInboxKey ?? ""} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Phone number ID</Label>
                    <Input name="phoneNumberId" defaultValue={connection.phoneNumberId ?? ""} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Display phone number</Label>
                    <Input
                      name="displayPhoneNumber"
                      defaultValue={connection.displayPhoneNumber ?? ""}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      name="autoProcess"
                      defaultChecked={connection.autoProcess}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Auto-process inbound files
                  </label>
                  <div className="text-xs text-muted-foreground">
                    {connection.senderMappingCount} mapping(s) · {connection.messageCount} message(s)
                  </div>
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  disabled={busyKey === `update-connection-${connection.id}`}
                >
                  {busyKey === `update-connection-${connection.id}`
                    ? "Saving..."
                    : "Update connection"}
                </Button>
              </form>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sender mappings</CardTitle>
          <CardDescription>
            Review and update phone-to-business routing without leaving the workspace settings flow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.connections.flatMap((connection) => connection.senderMappings).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No sender mappings yet. Add one above if multiple client businesses share a
              connection.
            </p>
          ) : (
            state.connections.flatMap((connection) =>
              connection.senderMappings.map((mapping) => (
                <form
                  key={`${mapping.id}-${mapping.updatedAt}`}
                  className="space-y-4 rounded-xl border border-slate-200 p-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleUpdateSenderMapping(mapping.id, new FormData(event.currentTarget));
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{mapping.label || mapping.senderPhoneNumber}</p>
                      <Badge variant={mapping.active ? "secondary" : "outline"}>
                        {mapping.active ? "Active" : "Inactive"}
                      </Badge>
                      <Badge variant="outline">
                        {
                          state.connections.find((connection) => connection.id === mapping.connectionId)
                            ?.label
                        }
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {mapping.clientBusinessName}
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Connection</Label>
                      <select
                        name="connectionId"
                        defaultValue={mapping.connectionId}
                        className={selectClassName}
                      >
                        {state.connections.map((connection) => (
                          <option key={connection.id} value={connection.id}>
                            {connection.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Client business</Label>
                      <select
                        name="clientBusinessId"
                        defaultValue={mapping.clientBusinessId}
                        className={selectClassName}
                      >
                        {state.clientBusinesses.map((business) => (
                          <option key={business.id} value={business.id}>
                            {business.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Sender phone number</Label>
                      <Input name="senderPhoneNumber" defaultValue={mapping.senderPhoneNumber} />
                    </div>
                    <div className="grid gap-2">
                      <Label>Label</Label>
                      <Input name="label" defaultValue={mapping.label ?? ""} />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Notes</Label>
                    <textarea
                      name="notes"
                      rows={3}
                      defaultValue={mapping.notes ?? ""}
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      name="active"
                      defaultChecked={mapping.active}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Mapping is active
                  </label>
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={busyKey === `update-mapping-${mapping.id}`}
                  >
                    {busyKey === `update-mapping-${mapping.id}`
                      ? "Saving..."
                      : "Update mapping"}
                  </Button>
                </form>
              ))
            )
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent inbound messages</CardTitle>
          <CardDescription>
            Trace each inbound attachment back to the connection, sender, and generated review
            record.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {state.recentMessages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No inbound WhatsApp messages yet.
            </p>
          ) : (
            state.recentMessages.map((message) => (
              <div
                key={message.id}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">
                      {message.fileName || message.senderName || message.senderPhoneNumber}
                    </p>
                    <Badge variant={messageStatusVariant(message.status)}>
                      {message.status.replace(/_/g, " ")}
                    </Badge>
                    <Badge variant="outline">{providerLabel(message.provider)}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(message.receivedAt).toLocaleString()}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  <span>Connection: {message.connectionLabel}</span>
                  <span>Sender: {message.senderPhoneNumber}</span>
                  <span>Business: {message.clientBusinessName || "Unmapped"}</span>
                </div>
                {message.failureReason ? (
                  <p className="mt-2 text-red-700">{message.failureReason}</p>
                ) : null}
                {message.reviewHref ? (
                  <div className="mt-2">
                    <Link href={message.reviewHref} className="text-sm font-medium text-slate-900 underline">
                      Open generated review item
                    </Link>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}
