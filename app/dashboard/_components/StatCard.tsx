import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
      className="rounded-2xl border border-cyan/20 bg-primary text-white shadow-glow"
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-cyan">{label}</p>
          <CardTitle className="break-words text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {displayValue}
          </CardTitle>
        </div>
        <div
          className={`flex size-11 items-center justify-center rounded-2xl ${accentClassName}`}
        >
          <Icon className="size-5" />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6 text-slate-300">{displayDescription}</p>
      </CardContent>
    </Card>
  );
}
