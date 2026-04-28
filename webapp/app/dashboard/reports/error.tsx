"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ReportsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Reports route failed to load", error);
  }, [error]);

  return (
    <section className="space-y-6" aria-labelledby="reports-error-heading">
      <Card className="rounded-[28px] border border-rose-200 bg-rose-50 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <CardTitle id="reports-error-heading" className="text-lg font-semibold text-rose-900">
                Reports failed to load
              </CardTitle>
              <CardDescription className="text-rose-700">
                The reporting workspace could not be rendered for this request.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-6 text-rose-800">
            Retry the report query or jump back into bookkeeping review while the workspace refreshes.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => reset()}>
              <RefreshCcw className="size-4" />
              Retry reports
            </Button>
            <Button asChild variant="outline" className="border-rose-300 text-rose-900 hover:bg-rose-100">
              <Link href="/dashboard/bookkeeping/review">Open bookkeeping review</Link>
            </Button>
            <Button asChild variant="outline" className="border-rose-300 text-rose-900 hover:bg-rose-100">
              <Link href="/dashboard/banking/review">Open banking review</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
