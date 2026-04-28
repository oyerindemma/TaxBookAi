import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  badge: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  align?: "left" | "center";
  className?: string;
};

export function SectionHeading({
  badge,
  title,
  description,
  actions,
  align = "left",
  className,
}: SectionHeadingProps) {
  const isCentered = align === "center";

  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        isCentered && "items-center text-center sm:flex-col sm:items-center",
        className
      )}
    >
      <div className={cn("max-w-3xl space-y-4", isCentered && "mx-auto")}>
        <Badge className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-white hover:bg-white/5">
          {badge}
        </Badge>
        <h2 className="text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl">
          {title}
        </h2>
        {description ? (
          <p className="text-base leading-7 text-white/60 sm:text-lg sm:leading-8">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className={cn(isCentered && "pt-2")}>{actions}</div> : null}
    </div>
  );
}
