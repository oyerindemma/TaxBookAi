import Link from "next/link";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { buildMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Terms of Use",
  description:
    "TaxBook AI terms of use placeholder for the public website and product access terms.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="space-y-6">
          <Badge className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-white hover:bg-white/5">
            Terms
          </Badge>
          <div className="space-y-4">
            <h1 className="text-4xl font-semibold tracking-tight text-white">
              Terms of use placeholder
            </h1>
            <p className="max-w-3xl text-base leading-7 text-white/65">
              This route is ready for TaxBook AI terms and legal conditions. It is intentionally
              lightweight so the marketing site does not link to a missing page.
            </p>
          </div>

          <Card className="border-white/10 bg-white/5 text-white shadow-glow backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-white">Legal readiness</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-7 text-white/72">
              <p>
                Before public rollout, replace this placeholder with the final terms governing
                website use, account access, billing, payment processing, and any product-specific
                legal obligations.
              </p>
            </CardContent>
          </Card>

          <Button
            asChild
            className="border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
          >
            <Link href="/">Back to homepage</Link>
          </Button>
        </div>
      </section>
    </MarketingShell>
  );
}
