import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/marketing/legal-document-page";
import { DPA_VERSION } from "@/lib/config/compliance";
import { buildMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Data Processing Addendum",
  description:
    "TaxBook AI Data Processing Addendum covering customer instructions, subprocessors, security, international transfers, and data return or deletion.",
  path: "/dpa",
});

export default function DataProcessingAddendumPage() {
  const sections = [
    {
      title: "Scope",
      paragraphs: [
        "This Data Processing Addendum applies where TaxBook AI processes personal data on behalf of a customer in connection with the provision of workspace-scoped product services.",
        "It supplements the TaxBook AI Terms of Use and describes the baseline data protection commitments that apply when customer data is processed under customer instructions.",
      ],
    },
    {
      title: "Roles and instructions",
      paragraphs: [
        "The customer acts as the controller for customer workspace data it submits to TaxBook AI, and TaxBook AI acts as the processor for that data except where TaxBook AI independently determines purposes for operational, security, billing, or legal compliance processing.",
        "TaxBook AI will process customer data only on documented customer instructions as reflected in product configuration, user actions, support requests, and the governing service agreement, unless otherwise required by law.",
      ],
    },
    {
      title: "Security measures",
      paragraphs: [
        "TaxBook AI applies reasonable technical and organizational measures designed to protect customer data against unauthorized access, disclosure, alteration, and destruction. These may include logical access controls, audit logging, environment-based configuration, and least-privilege operational practices.",
        "Customers remain responsible for configuring workspace permissions appropriately and limiting access to authorized team members and service providers.",
      ],
    },
    {
      title: "Subprocessors and cross-border transfers",
      paragraphs: [
        "TaxBook AI may engage infrastructure, communications, analytics, payment, and AI service providers that act as subprocessors where necessary to operate the service. TaxBook AI aims to select subprocessors with appropriate security and confidentiality commitments.",
        "Where subprocessors or infrastructure involve cross-border processing, TaxBook AI seeks to rely on commercially reasonable contractual and operational safeguards suited to the transfer context.",
      ],
    },
    {
      title: "Assistance and incidents",
      paragraphs: [
        "Taking into account the nature of the processing and the information available, TaxBook AI will use commercially reasonable efforts to assist customers with appropriate requests relating to security incidents, data subject rights, and compliance obligations relevant to the service.",
        "Customers remain responsible for evaluating whether incident notices, response actions, and downstream regulatory obligations apply to their own legal context.",
      ],
    },
    {
      title: "Deletion and return",
      paragraphs: [
        "Upon termination of services or customer instruction, TaxBook AI may delete, anonymize, or return customer data in line with product capabilities, legal obligations, backup retention practices, and operational constraints.",
        `This DPA version is dated ${DPA_VERSION}. Customers with custom enterprise requirements may request a tailored legal review through the contact channels below.`,
      ],
    },
  ] as const;

  return (
    <LegalDocumentPage
      badge="DPA"
      title="Data Processing Addendum"
      description="The baseline data processing terms that apply when TaxBook AI processes customer workspace data on behalf of a business, finance team, or accounting firm."
      sections={sections}
    />
  );
}
