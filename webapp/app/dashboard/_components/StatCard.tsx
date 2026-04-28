import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value?: string | null;
  description?: string;
  icon: LucideIcon;
  accentClassName?: string;
};

export default function StatCard({
  label,
  value,
  description,
  icon: Icon,
  accentClassName = "bg-gradient-primary text-white shadow-glow",
}: StatCardProps) {
  const displayValue = value?.trim() ? value : "—";
  const displayDescription =
    description?.trim() || "This metric will populate automatically as new data arrives.";

  return (
    <Card
      role="group"
      aria-label={`${label}: ${displayValue}`}
      className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 text-slate-950 shadow-[0_12px_30px_rgba(15,23,42,0.06)]"
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 border-b border-slate-200/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.95)_0%,rgba(255,255,255,0.92)_100%)] pb-4">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            {label}
          </p>
          <CardTitle className="break-words text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
            {displayValue}
          </CardTitle>
        </div>
        <div
          className={cn(
            "flex size-11 items-center justify-center rounded-2xl border border-slate-200/70 shadow-sm",
            accentClassName
          )}
        >
          <Icon className="size-5" />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6 text-slate-600">{displayDescription}</p>
      </CardContent>
    </Card>
  );
}
