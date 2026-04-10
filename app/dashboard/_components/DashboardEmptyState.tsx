import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type DashboardEmptyStateProps = {
  title?: string;
  message: string;
  action?: ReactNode;
  className?: string;
};

export default function DashboardEmptyState({
  title,
  message,
  action,
  className,
}: DashboardEmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-[24px] border border-dashed border-slate-300/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.95)_0%,rgba(255,255,255,0.9)_100%)] px-5 py-8 text-center",
        className
      )}
    >
      {title ? (
        <div className="text-sm font-semibold tracking-tight text-slate-950">{title}</div>
      ) : null}
      <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
