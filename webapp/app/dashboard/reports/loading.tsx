function MetricSkeleton() {
  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 p-6 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
      <div className="animate-pulse space-y-4">
        <div className="h-3 w-24 rounded-full bg-slate-200" />
        <div className="h-8 w-36 rounded-2xl bg-slate-200" />
        <div className="h-4 w-full max-w-[16rem] rounded-full bg-slate-100" />
      </div>
    </div>
  );
}

function PanelSkeleton({ tall = false }: { tall?: boolean }) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 p-6 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
      <div className="animate-pulse space-y-4">
        <div className="h-3 w-24 rounded-full bg-slate-200" />
        <div className="h-6 w-52 rounded-full bg-slate-200" />
        <div className="h-4 w-full max-w-[26rem] rounded-full bg-slate-100" />
        <div className={`rounded-[20px] bg-slate-100 ${tall ? "h-80" : "h-48"}`} />
      </div>
    </div>
  );
}

export default function ReportsLoading() {
  return (
    <section className="space-y-6" aria-busy="true" aria-label="Loading reports">
      <div className="space-y-4">
        <div className="animate-pulse space-y-3">
          <div className="flex gap-2">
            <div className="h-6 w-28 rounded-full bg-slate-200" />
            <div className="h-6 w-36 rounded-full bg-slate-100" />
          </div>
          <div className="h-10 w-72 rounded-2xl bg-slate-200" />
          <div className="h-4 w-full max-w-[32rem] rounded-full bg-slate-100" />
        </div>
      </div>

      <PanelSkeleton />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricSkeleton />
        <MetricSkeleton />
        <MetricSkeleton />
        <MetricSkeleton />
        <MetricSkeleton />
        <MetricSkeleton />
        <MetricSkeleton />
      </div>

      <PanelSkeleton />
      <PanelSkeleton tall />
    </section>
  );
}
