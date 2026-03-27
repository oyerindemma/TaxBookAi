import Link from "next/link";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { buildMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Privacy Policy",
  description:
    "TaxBook AI privacy information and data handling overview for website visitors and customers.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="space-y-6">
          <Badge className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-white hover:bg-white/5">
            Privacy
          </Badge>
          <div className="space-y-4">
            <h1 className="text-4xl font-semibold tracking-tight text-white">
              Privacy policy placeholder
            </h1>
            <p className="max-w-3xl text-base leading-7 text-white/65">
              This page is a safe placeholder for TaxBook AI privacy information. It can be
              expanded into the full customer-facing privacy policy without changing the route
              structure.
            </p>
          </div>

          <Card className="border-white/10 bg-white/5 text-white shadow-glow backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-white">Data handling overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-7 text-white/72">
              <p>
                TaxBook AI handles financial workflows, workspace-scoped product activity, and
                operational metadata.
              </p>
              <p>
                Before production launch, this page should be replaced with the final legal copy
                covering data collection, processing, retention, and contact channels.
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
