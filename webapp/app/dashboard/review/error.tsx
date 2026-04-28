"use client";

import { Button } from "@/components/ui/button";

export default function ReviewError({ reset }: { reset: () => void }) {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold">Review</h1>
      <p className="text-sm text-rose-600">Review workflow failed to load.</p>
      <Button type="button" onClick={() => reset()}>Retry</Button>
    </section>
  );
}
