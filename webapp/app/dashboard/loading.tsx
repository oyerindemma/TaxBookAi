function ExecutiveCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 p-6 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
      <div className="animate-pulse">
        <div className="h-3 w-24 rounded-full bg-slate-200" />
        <div className="mt-4 h-10 w-40 rounded-2xl bg-slate-200" />
        <div className="mt-3 h-4 w-full max-w-[16rem] rounded-full bg-slate-200" />
      </div>
    </div>
  );
}

function PanelSkeleton({ tall = false }: { tall?: boolean }) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 p-6 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
      <div className="animate-pulse">
        <div className="h-3 w-24 rounded-full bg-slate-200" />
        <div className="mt-4 h-6 w-48 rounded-full bg-slate-200" />
        <div className="mt-3 h-4 w-full max-w-[20rem] rounded-full bg-slate-200" />
        <div className={`mt-6 rounded-2xl bg-slate-100 ${tall ? "h-72" : "h-48"}`} />
      </div>
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <section className="space-y-10" aria-busy="true" aria-label="Loading dashboard">
      <div className="overflow-hidden rounded-[32px] border border-slate-200/80 bg-white/95 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-8">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
          <div className="animate-pulse space-y-6">
            <div className="flex gap-2">
              <div className="h-7 w-28 rounded-full bg-slate-200" />
              <div className="h-7 w-24 rounded-full bg-slate-200" />
              <div className="h-7 w-32 rounded-full bg-slate-200" />
            </div>
            <div className="h-12 w-full max-w-[36rem] rounded-3xl bg-slate-200" />
            <div className="h-5 w-full max-w-[32rem] rounded-full bg-slate-200" />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="h-28 rounded-2xl bg-slate-100" />
              <div className="h-28 rounded-2xl bg-slate-100" />
              <div className="h-28 rounded-2xl bg-slate-100" />
            </div>
            <div className="flex gap-3">
              <div className="h-11 w-44 rounded-xl bg-slate-200" />
              <div className="h-11 w-40 rounded-xl bg-slate-200" />
              <div className="h-11 w-36 rounded-xl bg-slate-200" />
            </div>
          </div>
          <PanelSkeleton tall />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <ExecutiveCardSkeleton />
        <ExecutiveCardSkeleton />
        <ExecutiveCardSkeleton />
        <ExecutiveCardSkeleton />
        <ExecutiveCardSkeleton />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <PanelSkeleton />
        <PanelSkeleton />
        <PanelSkeleton />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <PanelSkeleton tall />
        <PanelSkeleton tall />
        <PanelSkeleton tall />
        <PanelSkeleton tall />
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <ExecutiveCardSkeleton />
        <ExecutiveCardSkeleton />
        <PanelSkeleton />
        <PanelSkeleton />
      </div>
    </section>
  );
}
