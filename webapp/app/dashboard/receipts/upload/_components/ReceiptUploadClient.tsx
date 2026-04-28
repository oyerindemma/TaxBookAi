"use client";

import Link from "next/link";
import { startTransition, useRef, useState, type FormEvent } from "react";
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
import { Label } from "@/components/ui/label";

type ClientBusinessOption = {
  id: number;
  name: string;
  defaultCurrency: string;
};

type RecentReceiptUpload = {
  id: number;
  fileName: string;
  status:
    | "UPLOADED"
    | "QUEUED"
    | "PROCESSING"
    | "EXTRACTED"
    | "READY_FOR_REVIEW"
    | "APPROVED"
    | "PARTIALLY_APPROVED"
    | "REJECTED"
    | "FAILED";
  documentType: "RECEIPT" | "INVOICE" | "CREDIT_NOTE" | "UNKNOWN";
  createdAt: string;
  clientBusinessName: string;
  duplicateOfUpload: {
    id: number;
    fileName: string;
    createdAt: string;
    status: string;
    clientBusinessName: string;
  } | null;
};

type ReceiptUploadClientProps = {
  workspaceName: string;
  clientBusinesses: ClientBusinessOption[];
  recentUploads: RecentReceiptUpload[];
  aiDevelopmentBypass: boolean;
};

const selectClassName =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function uploadStatusVariant(status: RecentReceiptUpload["status"]) {
  if (status === "APPROVED") return "secondary";
  if (status === "PARTIALLY_APPROVED") return "outline";
  if (status === "REJECTED" || status === "FAILED") return "destructive";
  if (status === "READY_FOR_REVIEW") return "default";
  return "outline";
}

export default function ReceiptUploadClient({
  workspaceName,
  clientBusinesses,
  recentUploads,
  aiDevelopmentBypass,
}: ReceiptUploadClientProps) {
  const router = useRouter();
  const [selectedClientBusinessId, setSelectedClientBusinessId] = useState(
    clientBusinesses[0]?.id ? String(clientBusinesses[0].id) : ""
  );
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleUpload(event: FormEvent) {
    event.preventDefault();

    if (!selectedClientBusinessId) {
      setUploadError("Select a client business before uploading.");
      return;
    }

    if (!file) {
      setUploadError("Choose a receipt, invoice, or PDF to scan.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadMessage(null);

    try {
      const formData = new FormData();
      formData.set("clientBusinessId", selectedClientBusinessId);
      formData.set("file", file);

      const res = await fetch("/api/ai/bookkeeping-extract", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data?.error ?? "Unable to extract receipt data.");
        return;
      }

      setUploadMessage("Receipt uploaded and extraction completed.");
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      const nextHref =
        typeof data?.uploadId === "number"
          ? `/dashboard/receipts?upload=${data.uploadId}`
          : "/dashboard/receipts";

      startTransition(() => {
        router.push(nextHref);
      });
    } catch {
      setUploadError("Network error uploading document.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Upload receipt</h1>
          <p className="text-muted-foreground">
            Send receipts, supplier invoices, and PDF support documents into TaxBook AI for
            extraction and bookkeeping draft creation.
          </p>
          <p className="text-sm text-muted-foreground">
            Workspace: <span className="font-medium text-foreground">{workspaceName}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Receipt AI</Badge>
          <Button asChild variant="outline">
            <Link href="/dashboard/client-businesses">Client businesses</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/receipts">Review queue</Link>
          </Button>
        </div>
      </div>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Upload document for extraction</CardTitle>
          <CardDescription>
            Supports JPG, PNG, WEBP, HEIC, HEIF, and PDF files. TaxBook AI stores the source
            document, extracts structured expense details, suggests a category, and creates a
            bookkeeping draft for review.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {aiDevelopmentBypass ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Development mode: AI receipt scanning is temporarily available without the paid plan
              gate for local testing.
            </div>
          ) : null}

          {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
          {uploadMessage ? <p className="text-sm text-emerald-700">{uploadMessage}</p> : null}

          {clientBusinesses.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
              Create a client business before uploading source documents.
            </div>
          ) : (
            <form onSubmit={handleUpload} className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
              <div className="grid gap-2">
                <Label htmlFor="receipt-client-business">Client business</Label>
                <select
                  id="receipt-client-business"
                  value={selectedClientBusinessId}
                  onChange={(event) => setSelectedClientBusinessId(event.target.value)}
                  disabled={uploading}
                  className={selectClassName}
                >
                  {clientBusinesses.map((business) => (
                    <option key={business.id} value={String(business.id)}>
                      {business.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="receipt-file">Receipt / document file</Label>
                <input
                  ref={fileInputRef}
                  id="receipt-file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  disabled={uploading}
                  className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={uploading}>
                  {uploading ? "Extracting..." : "Upload and extract"}
                </Button>
              </div>
            </form>
          )}

          <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
            Files are processed server-side with workspace-scoped access checks. Large files and
            unsupported types are rejected before extraction runs.
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Recent uploads</CardTitle>
          <CardDescription>
            The latest receipt scans in this workspace. Open one to review extracted fields,
            confidence, and draft status.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentUploads.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">
              No receipts yet. Your first upload will appear here once extraction completes.
            </div>
          ) : (
            recentUploads.map((upload) => (
              <div
                key={upload.id}
                className="rounded-xl border border-border/70 bg-background px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{upload.fileName}</p>
                      <Badge variant={uploadStatusVariant(upload.status)}>
                        {upload.status.replace(/_/g, " ")}
                      </Badge>
                      <Badge variant="outline">
                        {upload.documentType.replace(/_/g, " ")}
                      </Badge>
                      {upload.duplicateOfUpload ? (
                        <Badge variant="destructive">Duplicate warning</Badge>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {upload.clientBusinessName} · Submitted{" "}
                      {new Date(upload.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <Button asChild variant="outline">
                    <Link href={`/dashboard/receipts?upload=${upload.id}`}>Review draft</Link>
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}
