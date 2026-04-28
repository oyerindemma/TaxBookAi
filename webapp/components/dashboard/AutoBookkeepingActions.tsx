"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

type AutoBookkeepingActionsProps = {
  categorizedPercent: number;
  pendingReviewPercent: number;
  transactionCount: number;
};

type ApiResult = {
  ok?: boolean;
  processedCount?: number;
  updatedCount?: number;
  postedCount?: number;
  needsReviewCount?: number;
  reviewNeededCount?: number;
  skippedCount?: number;
  error?: string;
};

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export default function AutoBookkeepingActions({
  categorizedPercent,
  pendingReviewPercent,
  transactionCount,
}: AutoBookkeepingActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<"categorize" | "auto-post" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasTransactions = transactionCount > 0;

  async function runAction(action: "categorize" | "auto-post") {
    setActiveAction(action);
    setMessage(null);
    setError(null);

    const endpoint = action === "categorize" ? "/api/ai/categorize" : "/api/ai/auto-post";

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: 100 }),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiResult;

      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error ?? "Auto-bookkeeping action failed.");
      }

      const reviewCount = payload.needsReviewCount ?? payload.reviewNeededCount ?? 0;
      const successCount =
        action === "categorize" ? payload.updatedCount ?? 0 : payload.postedCount ?? 0;
      setMessage(
        action === "categorize"
          ? `${successCount} transaction${successCount === 1 ? "" : "s"} categorized. ${reviewCount} need review.`
          : `${successCount} transaction${successCount === 1 ? "" : "s"} posted. ${reviewCount} moved to review.`
      );

      startTransition(() => {
        router.refresh();
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Auto-bookkeeping action failed.");
    } finally {
      setActiveAction(null);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-800 bg-[#0B0F1A] p-6 shadow-sm transition duration-200 hover:scale-[1.01] hover:shadow-lg hover:shadow-cyan-950/20">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-xs font-medium text-cyan-200">
            <Sparkles className="size-3.5" />
            Auto-bookkeeping
          </div>
          <h3 className="mt-4 text-xl font-semibold text-white">Categorize and post with AI</h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-gray-400">
            Suggest categories for unmatched transactions, then post only high-confidence matches to
            the double-entry ledger.
          </p>
        </div>
        <div className="grid min-w-[220px] grid-cols-2 gap-3">
          <div className="rounded-2xl border border-gray-800 bg-white/[0.03] p-4">
            <div className="text-2xl font-bold text-white">
              {clampPercent(categorizedPercent)}%
            </div>
            <div className="mt-1 text-xs font-medium uppercase text-gray-400">Categorized</div>
          </div>
          <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
            <div className="text-2xl font-bold text-white">
              {clampPercent(pendingReviewPercent)}%
            </div>
            <div className="mt-1 text-xs font-medium uppercase text-yellow-100/80">
              Pending review
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button
          type="button"
          className="rounded-xl transition-all duration-200"
          disabled={!hasTransactions || activeAction !== null || isPending}
          onClick={() => void runAction("categorize")}
        >
          {activeAction === "categorize" ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 size-4" />
          )}
          Auto-Categorize
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-xl border-gray-700 bg-transparent text-white transition-all duration-200 hover:bg-white/10"
          disabled={!hasTransactions || activeAction !== null || isPending}
          onClick={() => void runAction("auto-post")}
        >
          {activeAction === "auto-post" ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 size-4" />
          )}
          Auto-Post
        </Button>
      </div>

      {message ? <p className="mt-4 text-sm text-emerald-300">{message}</p> : null}
      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
      {!hasTransactions ? (
        <p className="mt-4 text-sm text-gray-500">
          Your workspace is ready. Import transactions to get started.
        </p>
      ) : null}
    </div>
  );
}
