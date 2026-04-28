import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/marketing/legal-document-page";
import { LEGAL_VERSION } from "@/lib/config/compliance";
import { buildMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Privacy Policy",
  description:
    "TaxBook AI privacy policy covering controller and processor roles, AI processing, cross-border transfer, security, NDPR rights, and contact channels.",
  path: "/privacy",
});

export default function PrivacyPage() {
  const sections = [
    {
      title: "Introduction",
      paragraphs: [
        "TaxBook AI provides bookkeeping, transaction review, tax workflow, and finance operations tools for businesses, finance teams, and accounting firms. This Privacy Policy explains how we handle personal data when you use our website, request a demo, create an account, or interact with workspace-scoped product features.",
        "We aim to handle information transparently, limit data access to legitimate business and support needs, and align our practices with applicable Nigerian data protection expectations, including the Nigeria Data Protection Regulation (NDPR).",
      ],
    },
    {
      title: "Data collection",
      paragraphs: [
        "We may collect account and contact details such as name, work email, phone number, company name, and workspace membership data when you sign up, request a demo, or contact TaxBook AI.",
        "Inside the product, we may process financial workflow data such as transaction records, imported statements, tax classifications, review notes, categories, client business records, billing metadata, and support interactions needed to operate the service.",
      ],
    },
    {
      title: "Data usage",
      paragraphs: [
        "We use collected data to provide the product, secure accounts, support transaction review and tax workflows, operate workspace-scoped analytics, respond to enquiries, maintain billing records, and improve reliability and product performance.",
        "Where AI-assisted features are used, context is limited to the workspace and intended task so TaxBook AI can return grounded bookkeeping, review, or tax workflow assistance rather than unrelated output.",
      ],
    },
    {
      title: "Data Controller vs Processor",
      paragraphs: [
        "TaxBook AI generally acts as a data controller for public website activity, account registration, product security, support operations, and billing administration. For workspace content uploaded or managed by customers, TaxBook AI may act as a processor handling data on behalf of the relevant business, finance team, or accounting firm.",
        "Where a customer controls the purpose and means of processing workspace records, that customer remains responsible for ensuring an appropriate legal basis, authority, and internal governance for the data entered into the service.",
      ],
    },
    {
      title: "AI processing transparency",
      paragraphs: [
        "TaxBook AI may use AI-assisted workflows for tasks such as bookkeeping extraction, categorization suggestions, summarization, alerts, and finance assistant responses. These features are designed to operate on grounded workspace context rather than freeform invention.",
        "AI-assisted outputs may still require human review. Customers remain responsible for verifying financial classifications, tax treatment, and filing decisions before relying on them operationally or legally.",
      ],
    },
    {
      title: "Cross-border data transfer",
      paragraphs: [
        "Depending on infrastructure, support tooling, AI providers, payment processors, and communications services, some data may be processed or stored outside Nigeria. Where this occurs, TaxBook AI aims to use commercially reasonable safeguards and contractual controls appropriate to the transfer context.",
        "By using the service, you understand that cross-border processing may be necessary to provide core product, security, support, and infrastructure functions.",
      ],
    },
    {
      title: "Data sharing",
      paragraphs: [
        "We do not sell your personal data. We may share limited data with infrastructure, hosting, analytics, payment, email, or AI service providers only to the extent reasonably necessary to operate TaxBook AI.",
        "We may also disclose information where required by law, regulation, lawful request, or to protect the security, rights, and integrity of TaxBook AI, our customers, and the public.",
      ],
    },
    {
      title: "Security",
      paragraphs: [
        "TaxBook AI applies reasonable technical and organizational safeguards designed to protect workspace data from unauthorized access, disclosure, alteration, or destruction. These measures may include access controls, environment-based configuration, audit-safe workflows, and operational monitoring.",
        "No internet-based system is completely risk free, so you should also protect your credentials, use appropriate workspace permissions, and notify us promptly if you suspect unauthorized access.",
      ],
    },
    {
      title: "Retention",
      paragraphs: [
        "We retain information for as long as needed to provide the service, maintain legitimate business records, support tax and audit workflows, resolve disputes, comply with legal obligations, and enforce agreements.",
        "Retention periods may differ depending on the type of data, workspace activity, billing requirements, and legal or operational needs. When data is no longer required, we aim to delete or de-identify it appropriately.",
      ],
    },
    {
      title: "Rights (NDPR)",
      paragraphs: [
        "Subject to applicable law, you may have rights to request access to your personal data, ask for correction of inaccurate data, object to certain processing, request deletion where appropriate, or ask for information about how your data is handled.",
        "Where TaxBook AI acts as a processor for workspace data controlled by a customer, some requests may need to be handled through the relevant workspace owner or administrator first.",
      ],
    },
    {
      title: "Contact",
      paragraphs: [
        `If you have privacy, data protection, billing, or administrative questions about TaxBook AI, use the contact channels below and include enough context for us to understand the affected workspace or request. This policy version is dated ${LEGAL_VERSION}.`,
      ],
    },
  ] as const;

  return (
    <LegalDocumentPage
      badge="Privacy"
      title="Privacy Policy"
      description="How TaxBook AI collects, uses, protects, and retains information across the website, billing flows, and workspace-scoped finance operations."
      sections={sections}
    />
  );
}
