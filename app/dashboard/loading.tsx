function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-cyan/15 bg-primary p-6 text-white shadow-glow">
      <div className="animate-pulse">
        <div className="h-4 w-24 rounded-full bg-white/10" />
        <div className="mt-4 h-8 w-36 rounded-full bg-white/10" />
        <div className="mt-3 h-4 w-full max-w-[14rem] rounded-full bg-white/10" />
      </div>
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <section className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="rounded-2xl border border-cyan/20 bg-primary p-6 text-white shadow-glow sm:p-8">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
          <div className="space-y-4 animate-pulse">
            <div className="h-6 w-28 rounded-full bg-white/10" />
            <div className="h-10 w-full max-w-[28rem] rounded-2xl bg-white/10" />
            <div className="h-4 w-full max-w-[24rem] rounded-full bg-white/10" />
            <div className="flex gap-3">
              <div className="h-11 w-40 rounded-xl bg-white/10" />
              <div className="h-11 w-36 rounded-xl bg-white/10" />
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="animate-pulse">
              <div className="h-4 w-32 rounded-full bg-white/10" />
              <div className="mt-4 h-10 w-40 rounded-2xl bg-white/10" />
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="h-20 rounded-2xl bg-white/10" />
                <div className="h-20 rounded-2xl bg-white/10" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-cyan/15 bg-primary p-6 shadow-glow">
            <div className="animate-pulse">
              <div className="h-5 w-40 rounded-full bg-white/10" />
              <div className="mt-6 space-y-4">
                <div className="h-24 rounded-2xl bg-white/5" />
                <div className="h-24 rounded-2xl bg-white/5" />
                <div className="h-24 rounded-2xl bg-white/5" />
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-cyan/15 bg-primary p-6 shadow-glow">
            <div className="animate-pulse">
              <div className="h-5 w-40 rounded-full bg-white/10" />
              <div className="mt-6 h-48 rounded-2xl bg-white/5" />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-cyan/15 bg-primary p-6 shadow-glow">
            <div className="animate-pulse">
              <div className="h-5 w-44 rounded-full bg-white/10" />
              <div className="mt-6 space-y-4">
                <div className="h-16 rounded-2xl bg-white/5" />
                <div className="h-16 rounded-2xl bg-white/5" />
                <div className="h-16 rounded-2xl bg-white/5" />
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-cyan/15 bg-primary p-6 shadow-glow">
            <div className="animate-pulse">
              <div className="h-5 w-36 rounded-full bg-white/10" />
              <div className="mt-6 space-y-4">
                <div className="h-20 rounded-2xl bg-white/5" />
                <div className="h-20 rounded-2xl bg-white/5" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
