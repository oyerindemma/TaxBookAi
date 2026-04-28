import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/marketing/legal-document-page";
import { buildMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Cookie Policy",
  description:
    "TaxBook AI cookie policy explaining why cookies are used, how they support the product, and how users can control them.",
  path: "/cookies",
});

export default function CookiesPage() {
  const sections = [
    {
      title: "Purpose",
      paragraphs: [
        "TaxBook AI uses cookies and similar technologies to keep the website and product working reliably, maintain session continuity, support security controls, and understand how visitors and customers use key workflows.",
        "Some cookies help with authentication, preferences, performance monitoring, and remembering settings that improve the experience across visits.",
      ],
    },
    {
      title: "Usage",
      paragraphs: [
        "Cookies may be used for essential sign-in and session handling, workspace access continuity, fraud and abuse prevention, analytics, and performance monitoring. Depending on product configuration, related technologies may also support support flows, marketing attribution, and product diagnostics.",
        "We aim to use these technologies in a measured way that supports secure product operation and better user experience rather than unnecessary tracking.",
      ],
    },
    {
      title: "Control",
      paragraphs: [
        "You can usually control or remove cookies through your browser settings. Limiting essential cookies may affect login, session persistence, workspace access, or other parts of TaxBook AI that depend on them to function correctly.",
        "If you have questions about cookie usage, privacy, or your options, use the contact details below.",
      ],
    },
  ] as const;

  return (
    <LegalDocumentPage
      badge="Cookies"
      title="Cookie Policy"
      description="How TaxBook AI uses cookies and similar technologies to support secure sign-in, workspace continuity, analytics, and a reliable product experience."
      sections={sections}
    />
  );
}
