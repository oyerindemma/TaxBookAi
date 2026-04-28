import type { Metadata } from "next";
import { Suspense } from "react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { redirectIfAuthenticated } from "@/lib/auth";
import { buildMarketingMetadata } from "@/lib/marketing-metadata";
import SignupForm from "./SignupForm";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Start Free",
  description: "Create a TaxBook AI account and start on the Starter plan for free.",
  path: "/signup",
});

export default async function Signup() {
  await redirectIfAuthenticated();

  return (
    <MarketingShell>
      <Suspense
        fallback={
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-10 text-white/60 shadow-glow">
              Loading signup...
            </div>
          </div>
        }
      >
        <SignupForm />
      </Suspense>
    </MarketingShell>
  );
}
