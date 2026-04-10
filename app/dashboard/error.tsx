"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard route failed to load", error);
  }, [error]);

  return (
    <section className="space-y-6" aria-labelledby="dashboard-error-heading">
      <Card className="rounded-2xl border border-rose-200 bg-rose-50 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <CardTitle
                id="dashboard-error-heading"
                className="text-lg font-semibold text-rose-900"
              >
                Dashboard failed to load
              </CardTitle>
              <CardDescription className="text-rose-700">
                Live workspace data could not be rendered for this dashboard request.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-6 text-rose-800">
            Try the dashboard again or jump into another workspace area while we retry the query
            path.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => reset()}>
              <RefreshCcw className="mr-2 size-4" />
              Retry dashboard
            </Button>
            <Button asChild variant="outline" className="border-rose-300 text-rose-900 hover:bg-rose-100">
              <Link href="/dashboard/workspaces">Open workspaces</Link>
            </Button>
            <Button asChild variant="outline" className="border-rose-300 text-rose-900 hover:bg-rose-100">
              <Link href="/dashboard/banking/review">Open review queue</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
