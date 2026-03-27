import type { Metadata } from "next";
import { Suspense } from "react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { redirectIfAuthenticated } from "@/lib/auth";
import { buildMarketingMetadata } from "@/lib/marketing-metadata";
import LoginForm from "./LoginForm";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Login",
  description: "Log in to your TaxBook AI workspace for bookkeeping, reconciliation, tax reporting, and team workflows.",
  path: "/login",
});

export default async function LoginPage() {
  await redirectIfAuthenticated();

  return (
    <MarketingShell>
      <Suspense
        fallback={
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-10 text-white/60 shadow-glow">
              Loading login...
            </div>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </MarketingShell>
  );
}
