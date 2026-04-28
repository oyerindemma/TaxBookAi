import Link from "next/link";
import { cn } from "@/lib/utils";

type TimelineItem = {
  label: string;
  detail: string;
  date?: string | null;
  href?: string | null;
  tone?: "default" | "success" | "warning";
};

type Props = {
  items: TimelineItem[];
  emptyLabel?: string;
};

export function InvoiceTimeline({
  items,
  emptyLabel = "No activity has been recorded yet.",
}: Props) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-400">{emptyLabel}</p>;
  }

  return (
    <ol className="space-y-4">
      {items.map((item, index) => (
        <li key={`${item.label}-${index}`} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              className={cn(
                "mt-1 size-2.5 rounded-full bg-slate-500",
                item.tone === "success" && "bg-cyan",
                item.tone === "warning" && "bg-blue"
              )}
            />
            {index < items.length - 1 ? <span className="mt-1 h-full w-px bg-white/10" /> : null}
          </div>
          <div className="min-w-0 space-y-1 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-white">{item.label}</p>
              {item.date ? (
                <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  {item.date}
                </span>
              ) : null}
            </div>
            {item.href ? (
              <Link
                href={item.href}
                className="text-sm text-slate-300 transition hover:text-cyan"
              >
                {item.detail}
              </Link>
            ) : (
              <p className="text-sm text-slate-300">{item.detail}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
