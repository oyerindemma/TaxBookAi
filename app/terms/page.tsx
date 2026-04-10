import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/marketing/legal-document-page";
import { LEGAL_VERSION } from "@/lib/config/compliance";
import { buildMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Terms of Use",
  description:
    "TaxBook AI terms of use covering service access, billing, indemnification, SLA disclaimers, limitation of liability, governing law, and contact information.",
  path: "/terms",
});

export default function TermsPage() {
  const sections = [
    {
      title: "Acceptance",
      paragraphs: [
        "By accessing the TaxBook AI website, creating an account, joining a workspace, or using product features, you agree to these Terms of Use. If you use TaxBook AI on behalf of a business or firm, you confirm that you have authority to bind that organization to these terms.",
        "If you do not agree with these terms, do not use the service.",
      ],
    },
    {
      title: "Service description",
      paragraphs: [
        "TaxBook AI provides software for bookkeeping workflows, transaction review, categorization, workspace-based collaboration, tax visibility, filing readiness support, and related operational analytics.",
        "We may improve, update, limit, or discontinue features over time, including beta and AI-assisted features, as part of maintaining a secure and reliable product.",
      ],
    },
    {
      title: "User responsibilities",
      paragraphs: [
        "You are responsible for maintaining accurate account information, protecting credentials, using appropriate workspace permissions, and ensuring that data uploaded into TaxBook AI is lawful and appropriately authorized.",
        "You must not misuse the platform, interfere with service security, attempt unauthorized access, upload malicious materials, or use TaxBook AI in a way that violates law, contract, or the rights of others.",
      ],
    },
    {
      title: "No professional advice",
      paragraphs: [
        "TaxBook AI provides software, workflow support, and data organization tools. It does not replace qualified legal, tax, audit, accounting, or financial advice from a licensed professional familiar with your specific facts.",
        "You remain responsible for reviewing outputs, classifications, and filings before taking business, tax, or regulatory action.",
      ],
    },
    {
      title: "Billing",
      paragraphs: [
        "Paid plans, subscriptions, add-ons, or premium features may be billed according to the pricing and billing terms shown at the time of purchase or renewal. You are responsible for accurate billing information and timely payment of charges.",
        "Unless otherwise stated, fees are non-refundable except where required by law or expressly approved by TaxBook AI. We may suspend or limit access for overdue accounts.",
      ],
    },
    {
      title: "SLA disclaimer",
      paragraphs: [
        "Unless TaxBook AI has expressly agreed otherwise in a written enterprise contract, service levels, uptime expectations, response times, support windows, and remediation commitments are provided on a commercially reasonable efforts basis only and do not create a binding service level agreement.",
        "Beta, preview, AI-assisted, or newly released features may have different support and availability characteristics from general availability functionality.",
      ],
    },
    {
      title: "Indemnification",
      paragraphs: [
        "You agree to indemnify and hold harmless TaxBook AI, its affiliates, personnel, and service providers from claims, liabilities, damages, losses, and costs arising from your misuse of the service, violation of law, violation of these terms, or infringement of the rights of another person or entity.",
        "This includes claims related to unauthorized data uploads, unlawful processing instructions, misuse of workspace access, and improper reliance on unreviewed outputs where review was reasonably required.",
      ],
    },
    {
      title: "Limitation of liability",
      paragraphs: [
        "To the maximum extent permitted by law, TaxBook AI is provided on an as-available basis without guarantees that the service will always be uninterrupted, error free, or suitable for every tax, finance, or accounting scenario.",
        "TaxBook AI will not be liable for indirect, incidental, special, consequential, punitive, or exemplary damages, or for loss of profits, revenue, goodwill, data, business opportunities, or regulatory outcomes arising from use of the service, except where liability cannot lawfully be excluded. Where direct liability cannot be excluded, it will be limited to the fees paid for the relevant service period to the extent permitted by law.",
      ],
    },
    {
      title: "Governing law",
      paragraphs: [
        "These terms are governed by the laws of the Federal Republic of Nigeria, without regard to conflict of law principles, unless another governing framework is required by mandatory law.",
        "Any dispute arising from these terms or your use of TaxBook AI will be handled in the appropriate courts or forums with jurisdiction in Nigeria, subject to applicable legal requirements.",
      ],
    },
    {
      title: "Contact",
      paragraphs: [
        `If you have questions about these terms, billing issues, or legal notices relating to TaxBook AI, use the contact channels below and include enough detail for us to identify the relevant account or workspace. This terms version is dated ${LEGAL_VERSION}.`,
      ],
    },
  ] as const;

  return (
    <LegalDocumentPage
      badge="Terms"
      title="Terms of Use"
      description="The terms that govern access to TaxBook AI, including service usage, billing expectations, responsibility boundaries, and legal contact routes."
      sections={sections}
    />
  );
}
