import { Badge } from "@/components/ui/badge";
import type {
  WorkspaceAlertSeverity,
  WorkspaceAlertStatus,
  WorkspaceAlertType,
} from "@/lib/workspace-alert-types";

export function formatWorkspaceAlertTypeLabel(type: WorkspaceAlertType) {
  return type
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function severityClassName(severity: WorkspaceAlertSeverity) {
  if (severity === "CRITICAL") {
    return "border-rose-200 bg-rose-50 text-rose-900";
  }
  if (severity === "WARNING") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  return "border-sky-200 bg-sky-50 text-sky-900";
}

function statusClassName(status: WorkspaceAlertStatus) {
  if (status === "OPEN") {
    return "border-rose-200 bg-rose-50 text-rose-900";
  }
  if (status === "SNOOZED") {
    return "border-slate-200 bg-slate-100 text-slate-800";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

export function WorkspaceAlertSeverityBadge({
  severity,
}: {
  severity: WorkspaceAlertSeverity;
}) {
  return (
    <Badge variant="outline" className={severityClassName(severity)}>
      {severity}
    </Badge>
  );
}

export function WorkspaceAlertStatusBadge({
  status,
}: {
  status: WorkspaceAlertStatus;
}) {
  return (
    <Badge variant="outline" className={statusClassName(status)}>
      {status}
    </Badge>
  );
}

export function WorkspaceAlertTypeBadge({
  type,
}: {
  type: WorkspaceAlertType;
}) {
  return (
    <Badge variant="outline" className="border-cyan/20 bg-cyan/5 text-cyan">
      {formatWorkspaceAlertTypeLabel(type)}
    </Badge>
  );
}
