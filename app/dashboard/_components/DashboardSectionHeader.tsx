import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type DashboardSectionHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export default function DashboardSectionHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: DashboardSectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 md:flex-row md:items-end md:justify-between",
        className
      )}
    >
      <div className="space-y-2">
        {eyebrow ? (
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            {eyebrow}
          </div>
        ) : null}
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
            {title}
          </h2>
          {description ? (
            <p className="max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
