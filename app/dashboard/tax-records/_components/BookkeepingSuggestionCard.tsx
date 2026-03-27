"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type {
  BookkeepingSuggestion,
  BookkeepingSuggestionMetadata,
} from "@/lib/bookkeeping-ai";

type BookkeepingSuggestionCardProps = {
  suggestion: BookkeepingSuggestion | null;
  metadata: BookkeepingSuggestionMetadata;
  applied?: boolean;
  onApply?: () => void;
  onDismiss: () => void;
};

function formatAmount(amount: number | null, currency: string) {
  if (amount === null) return "Review manually";

  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: currency || "NGN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency || "NGN"} ${amount.toFixed(2)}`;
  }
}

function providerLabel(provider: BookkeepingSuggestionMetadata["provider"]) {
  if (provider === "openai") return "OpenAI";
  if (provider === "heuristic-fallback") return "Fallback rules";
  return "Unavailable";
}

function relevanceVariant(relevance: string) {
  if (relevance === "RELEVANT") return "secondary" as const;
  if (relevance === "UNCERTAIN") return "outline" as const;
  return "ghost" as const;
}

export default function BookkeepingSuggestionCard({
  suggestion,
  metadata,
  applied = false,
  onApply,
  onDismiss,
}: BookkeepingSuggestionCardProps) {
  return (
    <Card className="max-w-2xl">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>AI bookkeeping suggestion</CardTitle>
            <CardDescription>
              Review this draft before moving it into the record form. Nothing is saved automatically.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={metadata.provider === "openai" ? "secondary" : "outline"}>
              {providerLabel(metadata.provider)}
            </Badge>
            <Badge variant="outline">
              {metadata.sourceType === "receipt-image" ? "Receipt image" : "Transaction text"}
            </Badge>
            {suggestion ? <Badge variant="outline">{suggestion.confidence} confidence</Badge> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {metadata.fileName ? (
          <p className="text-xs text-muted-foreground">Source file: {metadata.fileName}</p>
        ) : null}

        {metadata.warnings.length > 0 ? (
          <div className="space-y-1 rounded-md border border-border/80 bg-muted/40 p-3 text-sm">
            {metadata.warnings.map((warning) => (
              <p key={warning} className="text-muted-foreground">
                {warning}
              </p>
            ))}
          </div>
        ) : null}

        {suggestion ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Classification
                </p>
                <p className="text-sm font-medium">{suggestion.classification}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Suggested category
                </p>
                <p className="text-sm">{suggestion.suggestedCategory ?? "Uncategorized"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Vendor
                </p>
                <p className="text-sm">{suggestion.vendorName ?? "Not detected"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Amount
                </p>
                <p className="text-sm">{formatAmount(suggestion.amount, suggestion.currency)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Transaction date
                </p>
                <p className="text-sm">{suggestion.transactionDate ?? "Review manually"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Currency
                </p>
                <p className="text-sm">{suggestion.currency}</p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Description
              </p>
              <p className="text-sm">{suggestion.description}</p>
            </div>

            <Separator />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 rounded-md border border-border/80 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">VAT</p>
                  <Badge variant={relevanceVariant(suggestion.vat.relevance)}>
                    {suggestion.vat.relevance.replace(/_/g, " ")}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{suggestion.vat.reason}</p>
                <p className="text-xs text-muted-foreground">
                  Suggested rate: {suggestion.vat.suggestedRate}%
                </p>
              </div>

              <div className="space-y-2 rounded-md border border-border/80 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">WHT</p>
                  <Badge variant={relevanceVariant(suggestion.wht.relevance)}>
                    {suggestion.wht.relevance.replace(/_/g, " ")}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{suggestion.wht.reason}</p>
                <p className="text-xs text-muted-foreground">
                  Suggested rate: {suggestion.wht.suggestedRate}%
                </p>
              </div>
            </div>

            {suggestion.notes.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Notes
                </p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {suggestion.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-md border border-dashed border-border/80 p-4 text-sm text-muted-foreground">
            No suggestion was generated. Configure `OPENAI_API_KEY` for receipt image analysis or paste the transaction text instead.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {suggestion && onApply ? (
            <Button type="button" onClick={onApply} variant={applied ? "secondary" : "default"}>
              {applied ? "Applied to form" : "Apply to form"}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
