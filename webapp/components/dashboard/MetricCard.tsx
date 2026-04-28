import type { LucideIcon } from "lucide-react";

type MetricCardProps = {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  trend?: string;
  children?: React.ReactNode;
};

export default function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  children,
}: MetricCardProps) {
  return (
    <div className="group flex h-full min-h-[178px] flex-col justify-between rounded-2xl border border-gray-800 bg-[#0B0F1A] p-5 shadow-sm transition duration-200 hover:scale-[1.01] hover:border-cyan-400/40 hover:shadow-lg hover:shadow-cyan-950/20">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl border border-gray-800 bg-white/[0.03] text-cyan-300">
            <Icon className="size-5" />
          </div>
          <h3 className="text-sm font-medium text-gray-300">{title}</h3>
        </div>
        {trend ? (
          <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-xs text-cyan-200">
            {trend}
          </div>
        ) : null}
      </div>

      <div className="mt-6">
        <div className="break-words text-2xl font-bold text-white">{value}</div>
        <p className="mt-3 text-sm leading-6 text-gray-400">{description}</p>
      </div>

      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}
