"use client";

import { Button } from "@/components/ui/button";

export default function ImportError({ reset }: { reset: () => void }) {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold">Import</h1>
      <p className="text-sm text-rose-600">Import workflow failed to load.</p>
      <Button type="button" onClick={() => reset()}>Retry</Button>
    </section>
  );
}
