import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DashboardPanelProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  iconClassName?: string;
  headerAction?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  headerClassName?: string;
};

export default function DashboardPanel({
  eyebrow,
  title,
  description,
  icon: Icon,
  iconClassName,
  headerAction,
  children,
  className,
  contentClassName,
  headerClassName,
}: DashboardPanelProps) {
  return (
    <Card
      className={cn(
        "overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_12px_30px_rgba(15,23,42,0.06)] backdrop-blur-sm",
        className
      )}
    >
      <CardHeader
        className={cn(
          "relative gap-3 border-b border-slate-200/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.95)_0%,rgba(255,255,255,0.92)_100%)] pb-5",
          headerClassName
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            {eyebrow ? (
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                {eyebrow}
              </div>
            ) : null}
            <div className="space-y-1">
              <CardTitle className="text-lg font-semibold tracking-tight text-slate-950">
                {title}
              </CardTitle>
              {description ? (
                <CardDescription className="max-w-2xl leading-6 text-slate-600">
                  {description}
                </CardDescription>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {headerAction}
            {Icon ? (
              <div
                className={cn(
                  "flex size-11 items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-50 text-primary",
                  iconClassName
                )}
              >
                <Icon className="size-5" />
              </div>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className={cn("pt-6", contentClassName)}>{children}</CardContent>
    </Card>
  );
}
