import type { Metadata } from "next";
import { PremiumHomepage } from "@/components/marketing/premium-homepage";
import { buildMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = buildMarketingMetadata({
  title: "The Finance Operations System for Nigerian Businesses",
  description:
    "TaxBook AI helps Nigerian businesses, finance teams, and accounting firms run transaction review, AI bookkeeping, reconciliation, VAT and WHT workflows, filing readiness, and accountant workspaces from one premium finance operations system.",
  path: "/",
  keywords: [
    "AI finance operations Nigeria",
    "bookkeeping and tax software Nigeria",
    "VAT WHT workflow platform",
    "accountant workspace Nigeria",
  ],
});

export default function HomePage() {
  return <PremiumHomepage />;
}
