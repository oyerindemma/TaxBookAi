"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type TransactionReviewStatus =
  | "IMPORTED"
  | "PENDING_REVIEW"
  | "REVIEWED"
  | "POSTED"
  | "FLAGGED";

const STATUS_LABELS: Record<TransactionReviewStatus, string> = {
  IMPORTED: "Imported",
  PENDING_REVIEW: "Pending review",
  REVIEWED: "Reviewed",
  POSTED: "Posted",
  FLAGGED: "Flagged",
};

const STATUS_CLASSES: Record<TransactionReviewStatus, string> = {
  IMPORTED: "border-slate-200 bg-slate-100 text-slate-900",
  PENDING_REVIEW: "border-amber-200 bg-amber-50 text-amber-950",
  REVIEWED: "border-emerald-200 bg-emerald-50 text-emerald-950",
  POSTED: "border-cyan-200 bg-cyan-50 text-cyan-950",
  FLAGGED: "border-rose-200 bg-rose-50 text-rose-950",
};

type Props = {
  status: TransactionReviewStatus;
  className?: string;
};

export default function TransactionReviewStatusBadge({ status, className }: Props) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", STATUS_CLASSES[status], className)}
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}
