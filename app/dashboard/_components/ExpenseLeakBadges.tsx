import { Badge } from "@/components/ui/badge";
import type {
  ExpenseLeakFindingSeverity,
  ExpenseLeakFindingStatus,
  ExpenseLeakFindingType,
} from "@/lib/expense-leak-types";

function getSeverityClassName(severity: ExpenseLeakFindingSeverity) {
  if (severity === "CRITICAL") {
    return "border-rose-200 bg-rose-50 text-rose-900";
  }
  if (severity === "WARNING") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  return "border-sky-200 bg-sky-50 text-sky-900";
}

function getStatusClassName(status: ExpenseLeakFindingStatus) {
  if (status === "RESOLVED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  if (status === "DISMISSED") {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }
  return "border-cyan/20 bg-cyan/5 text-cyan-900";
}

function getTypeLabel(type: ExpenseLeakFindingType) {
  if (type === "RECURRING_SPEND") return "Recurring spend";
  if (type === "DUPLICATE_VENDOR_CHARGE") return "Duplicate charge";
  return "Spend spike";
}

export function ExpenseLeakSeverityBadge({
  severity,
}: {
  severity: ExpenseLeakFindingSeverity;
}) {
  return (
    <Badge variant="outline" className={getSeverityClassName(severity)}>
      {severity}
    </Badge>
  );
}

export function ExpenseLeakStatusBadge({
  status,
}: {
  status: ExpenseLeakFindingStatus;
}) {
  return (
    <Badge variant="outline" className={getStatusClassName(status)}>
      {status === "DISMISSED" ? "Dismissed" : status === "RESOLVED" ? "Resolved" : "Open"}
    </Badge>
  );
}

export function ExpenseLeakTypeBadge({
  type,
}: {
  type: ExpenseLeakFindingType;
}) {
  return (
    <Badge variant="outline" className="border-cyan/20 bg-white text-slate-700">
      {getTypeLabel(type)}
    </Badge>
  );
}
