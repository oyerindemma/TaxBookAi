"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCcw } from "lucide-react";

type RecalculateTaxButtonProps = {
  userId: number;
  transactionCount: number;
  isSetupComplete: boolean;
};

export default function RecalculateTaxButton({
  userId,
  transactionCount,
  isSetupComplete,
}: RecalculateTaxButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const hasTransactions = transactionCount > 0;
  const canRecalculate = hasTransactions;

  async function recalculateTax() {
    if (!canRecalculate || isCalculating) return;

    setError(null);
    setIsCalculating(true);

    try {
      const response = await fetch("/api/tax/compute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;

      if (!response.ok) {
        setError(data?.message ?? data?.error ?? "Tax could not be recalculated.");
        return;
      }

      router.refresh();
    } catch {
      setError("Tax could not be recalculated.");
    } finally {
      setIsCalculating(false);
    }
  }

  return (
    <div className="space-y-2">
      {hasTransactions && !isSetupComplete ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Your tax estimate may be inaccurate until transactions are categorized.
        </div>
      ) : null}
      <button
        type="button"
        onClick={recalculateTax}
        disabled={!canRecalculate || isCalculating}
        title={!canRecalculate ? "Add transactions to calculate tax" : ""}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
      >
        <RefreshCcw className={isCalculating ? "size-4 animate-spin" : "size-4"} />
        {isCalculating ? "Calculating estimate..." : "Recalculate Tax"}
      </button>
      {!canRecalculate ? (
        <p className="text-sm text-muted-foreground">Add transactions to calculate tax</p>
      ) : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
