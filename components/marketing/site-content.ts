import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Building2,
  Calculator,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileSearch,
  Headphones,
  Landmark,
  Layers3,
  Mail,
  MapPin,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
} from "lucide-react";

type IconCard = {
  icon: LucideIcon;
  title: string;
  description: string;
};

type FeatureBlock = {
  icon: LucideIcon;
  badge: string;
  title: string;
  description: string;
  points: string[];
};

type AudienceBlock = {
  icon: LucideIcon;
  title: string;
  description: string;
  outcomes: string[];
};

export const MARKETING_NAME = "TaxBook AI";

export const MARKETING_HEADLINE =
  "AI accounting software for Nigerian businesses and accounting firms";

export const MARKETING_SUBHEADLINE =
  "TaxBook AI helps businesses, finance teams, and accounting firms move from receipt capture to bookkeeping review, bank reconciliation, VAT and WHT summaries, and filing-ready tax workflows in one audit-friendly workspace.";

export const MARKETING_TAGLINE =
  "Nigeria-first AI bookkeeping, reconciliation, and filing workflows";

export const MARKETING_NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
] as const;

export const COMPANY_DETAILS = {
  email: "hello@taxbook.africa",
  phone: "+234 700 000 0000",
  location: "Lagos, Nigeria",
};

export const HERO_STATS = [
  { label: "Receipt to filing-ready output", value: "Upload, review, reconcile, close" },
  { label: "Nigeria-ready tax layer", value: "VAT, WHT, exceptions, filing packs" },
  { label: "Built for teams and firms", value: "Multi-business workspaces with roles" },
  { label: "AI where it saves time", value: "Capture, matching, and grounded answers" },
];

export const VALUE_STRIP: IconCard[] = [
  {
    icon: Calculator,
    title: "Nigeria-ready VAT and WHT workflows",
    description:
      "Keep tax treatment, summaries, exceptions, and filing prep close to the underlying records.",
  },
  {
    icon: Sparkles,
    title: "AI-assisted bookkeeping",
    description:
      "Turn uploaded receipts and invoices into structured drafts that accountants can review before posting.",
  },
  {
    icon: Landmark,
    title: "Bank reconciliation",
    description:
      "Import statements, surface unmatched items, and move from transaction noise to a clean reconciliation queue.",
  },
  {
    icon: Building2,
    title: "Multi-business workspaces",
    description:
      "Operate one entity or many client businesses with cleaner boundaries, roles, and reporting context.",
  },
  {
    icon: ShieldCheck,
    title: "Audit-friendly review process",
    description:
      "Keep human approval, notes, evidence, and traceable changes in the workflow instead of after the fact.",
  },
];

export const HOME_WORKFLOW_STEPS = [
  {
    step: "01",
    title: "Upload",
    description:
      "Drop in receipts, invoices, or bank statements for the right workspace and client business.",
  },
  {
    step: "02",
    title: "Review",
    description:
      "Approve AI-extracted fields, fix tax treatment, and keep bookkeeping review under accountant control.",
  },
  {
    step: "03",
    title: "Reconcile",
    description:
      "Match transactions against invoices, ledger activity, and historical patterns before posting.",
  },
  {
    step: "04",
    title: "Close, report, and file",
    description:
      "Generate VAT and WHT summaries, review filing packs, and export filing-ready outputs from live workspace data.",
  },
];

export const HOME_FEATURE_BLOCKS: FeatureBlock[] = [
  {
    icon: ReceiptText,
    badge: "AI receipt scanner",
    title: "Capture receipts and invoices without retyping the basics.",
    description:
      "Upload JPG, PNG, PDF, or document files into the bookkeeping queue and let TaxBook AI draft the first pass.",
    points: [
      "Vendor, date, total, VAT, WHT, and line-item extraction",
      "Duplicate detection and confidence-aware review",
      "Structured posting flow instead of raw OCR text",
    ],
  },
  {
    icon: FileSearch,
    badge: "Bookkeeping review",
    title: "Give accountants a faster review queue, not a black box.",
    description:
      "Edits, approvals, rejections, and evidence stay visible before anything reaches the ledger.",
    points: [
      "Editable extracted fields and category suggestions",
      "Review-ready statuses and posting controls",
      "Audit trail on every decision",
    ],
  },
  {
    icon: Landmark,
    badge: "Bank reconciliation AI",
    title: "Move from imported statements to matched transactions quickly.",
    description:
      "Surface likely invoice, ledger, and vendor matches with a queue built for finance operators.",
    points: [
      "CSV import with flexible column mapping",
      "Suggested matches and reconciliation actions",
      "Professional plan unlock for higher-control teams",
    ],
  },
  {
    icon: Calculator,
    badge: "Tax engine",
    title: "See VAT and WHT exposure while the work is still fixable.",
    description:
      "TaxBook AI computes summaries, exceptions, and review schedules from live accounting data.",
    points: [
      "VAT and WHT summaries by business and period",
      "Exceptions for missing treatment, evidence, or duplicate sources",
      "CIT support scaffolding for close prep",
    ],
  },
  {
    icon: CalendarDays,
    badge: "Filing workflow",
    title: "Prepare VAT and WHT filing packs without pretending unsupported auto-submission.",
    description:
      "Build filing drafts, review exceptions, export schedules, and log manual submission steps for TaxPro Max-style workflows.",
    points: [
      "Filing drafts, evidence, notes, and submission logs",
      "Filing-ready summaries and JSON payload candidates",
      "Manual submission workflow with audit-friendly checkpoints",
    ],
  },
  {
    icon: Building2,
    badge: "Client business management",
    title: "Keep businesses, clients, and workspace context cleanly separated.",
    description:
      "Ideal for firms and finance teams handling multiple entities without losing operational clarity.",
    points: [
      "Workspace-scoped access and business switching",
      "Client businesses linked to invoices, recurring billing, banking, and tax records",
      "Cleaner reporting context across portfolios",
    ],
  },
  {
    icon: Sparkles,
    badge: "Assistant layer",
    title: "Ask grounded finance questions without leaving workspace context.",
    description:
      "TaxBook AI turns live workspace data into accountant-friendly answers, quick actions, and review priorities instead of generic chatbot output.",
    points: [
      "Workspace-aware answers from invoices, banking, tax, and filing data",
      "Quick actions into overdue invoices, reconciliation, and filing review",
      "Graceful fallback mode when OpenAI is unavailable",
    ],
  },
];

export const WHO_IT_IS_FOR: AudienceBlock[] = [
  {
    icon: Users,
    title: "Accounting firms",
    description:
      "Manage client portfolios, keep each business isolated, and give reviewers a cleaner path from raw documents to tax-ready outputs.",
    outcomes: [
      "Multi-business workspace structure",
      "Audit-friendly review flows for client work",
      "Professional plan unlocks banking and team workflows",
    ],
  },
  {
    icon: Building2,
    title: "SMEs",
    description:
      "Replace spreadsheets and scattered tools with one operating layer for receipts, invoices, tax visibility, and reporting.",
    outcomes: [
      "Starter for manual bookkeeping and reporting",
      "Growth for AI receipt scanning and automation",
      "Clear upgrade path without migrating systems",
    ],
  },
  {
    icon: WalletCards,
    title: "Finance operators",
    description:
      "Give controllers, ops leads, and finance managers cleaner daily workflows around capture, review, reconciliation, and close.",
    outcomes: [
      "Shared workspace with role-based control",
      "Reconciliation queue and tax exceptions in one place",
      "Assistant layer for live workspace questions",
    ],
  },
];

export const PREVIEW_CARDS = [
  {
    eyebrow: "AI capture",
    title: "Receipt and invoice uploads land in a review queue accountants can trust.",
    description:
      "Instead of sending OCR text into a spreadsheet, TaxBook AI drafts structured fields and flags duplicates or low-confidence values before posting.",
    accentClassName: "from-emerald-50 via-background to-amber-50",
    rows: [
      { label: "Documents ready for review", value: "18 items" },
      { label: "Low-confidence fields", value: "3 flagged" },
      { label: "Duplicate warnings", value: "2 matched" },
    ],
  },
  {
    eyebrow: "Reconciliation",
    title: "Bank activity moves through a queue built for matching, review, and posting.",
    description:
      "Import statement lines, surface likely matches, and resolve unmatched transactions without leaving workspace context.",
    accentClassName: "from-sky-50 via-background to-background",
    rows: [
      { label: "Statement rows imported", value: "246 this month" },
      { label: "Suggested matches", value: "31 queued" },
      { label: "Still unmatched", value: "9 items" },
    ],
  },
  {
    eyebrow: "Tax close",
    title: "VAT, WHT, and filing readiness are visible before the reporting deadline arrives.",
    description:
      "Close the loop from day-to-day bookkeeping into tax summaries, evidence, and filing review packs for the selected business and period.",
    accentClassName: "from-amber-50 via-background to-emerald-50",
    rows: [
      { label: "VAT payable", value: "NGN 1.53m" },
      { label: "WHT exceptions", value: "3 items" },
      { label: "Filing drafts ready", value: "2 prepared" },
    ],
  },
];

export const FEATURE_PILLARS = [
  {
    title: "Capture and review",
    description:
      "Move from uploaded documents into a reviewable bookkeeping queue without sacrificing accountant oversight.",
    items: [
      "AI receipt scanner for receipts, invoices, and supporting documents",
      "Bookkeeping review queue with approvals, rejections, notes, and evidence",
      "Vendor, category, VAT, and WHT suggestions grounded in workspace history",
      "Duplicate detection before records are posted",
    ],
  },
  {
    title: "Reconcile and operate",
    description:
      "Keep day-to-day finance work connected across invoices, banking, clients, and recurring activities.",
    items: [
      "Client business management and workspace switching",
      "Recurring invoices and receivables follow-up",
      "Bank statement import and reconciliation actions",
      "Team collaboration for reviewers and operators",
    ],
  },
  {
    title: "Close and explain",
    description:
      "Turn live accounting data into reports, tax summaries, and finance answers that are easier to trust.",
    items: [
      "VAT and WHT summaries by business and filing period",
      "Filing-ready schedules, evidence packs, and compliance exception tracking",
      "Embedded assistant for overdue invoices, unmatched transactions, and tax questions",
      "Audit-friendly activity history across the workspace",
    ],
  },
];

export const FEATURE_WORKFLOWS: IconCard[] = [
  {
    icon: ReceiptText,
    title: "Upload source documents once",
    description:
      "Bring in receipts, invoices, and bank statements directly into the correct business context instead of forwarding files around.",
  },
  {
    icon: Layers3,
    title: "Review before posting",
    description:
      "Correct fields, confirm tax treatment, and attach evidence while the supporting document is still in front of the reviewer.",
  },
  {
    icon: Landmark,
    title: "Reconcile with live records",
    description:
      "Use suggestions against invoices, ledger data, and historical vendors to clear bank activity faster.",
  },
  {
    icon: BarChart3,
    title: "Close, report, and prepare filings",
    description:
      "Generate VAT and WHT views, filing summaries, submission checklists, and finance answers from the same live workspace data.",
  },
];

export const GOVERNANCE_FEATURES: IconCard[] = [
  {
    icon: ShieldCheck,
    title: "Role-based collaboration",
    description:
      "Owners, admins, members, and viewers can work in the same workspace without blurring who should review, post, or export.",
  },
  {
    icon: CheckCircle2,
    title: "Audit history that supports review",
    description:
      "Keep changes, overrides, and approvals traceable so month-end questions do not depend on memory.",
  },
  {
    icon: Building2,
    title: "Workspace isolation that scales",
    description:
      "Each business or client workspace stays separate, which matters when firms and finance teams operate across multiple entities.",
  },
];

export const PRICING_INCLUSIONS = [
  "Starter is free for manual bookkeeping, VAT visibility, and core reporting.",
  "Growth adds AI receipt scanning, bookkeeping automation, invoices, and recurring billing.",
  "Professional unlocks bank reconciliation, audit workflows, team collaboration, and filing-ready tax workflows.",
  "Enterprise stays sales-led for larger rollouts, integrations, and priority support.",
];

export const PRICING_FAQ = [
  {
    question: "Can I start without speaking to sales?",
    answer:
      "Yes. Starter is free to begin with, and Growth and Professional are designed for self-serve upgrades when billing is enabled in your workspace.",
  },
  {
    question: "Which plan unlocks AI receipt scanning?",
    answer:
      "Growth is the first paid plan for AI receipt scanning and bookkeeping automation. Professional includes it as well.",
  },
  {
    question: "Which plan unlocks bank reconciliation?",
    answer:
      "Professional is the plan for bank reconciliation, audit-friendly review workflows, and team collaboration.",
  },
  {
    question: "How does Enterprise work?",
    answer:
      "Enterprise is sales-led. Use it when you need unlimited scale, rollout support, integrations, or a more tailored operating model.",
  },
];

export const PLAN_DECISION_GUIDE = [
  {
    icon: Sparkles,
    title: "Move to Growth when AI capture becomes the bottleneck",
    description:
      "Growth is for teams that want receipt scanning, bookkeeping automation, and invoicing without jumping into heavier reconciliation controls yet.",
    cta: "Best fit: Growth",
  },
  {
    icon: Landmark,
    title: "Move to Professional when finance operations need tighter control",
    description:
      "Professional adds bank reconciliation, audit logs, tax filing support, and multi-user workflows for firms and finance teams.",
    cta: "Best fit: Professional",
  },
  {
    icon: Users,
    title: "Talk to sales for Enterprise rollouts",
    description:
      "Enterprise is designed for larger firms that need unlimited scale, integrations, and priority onboarding support.",
    cta: "Best fit: Enterprise",
  },
];

export const CONTACT_PATHS = [
  {
    icon: CalendarDays,
    title: "Book a demo",
    description:
      "Walk through receipt capture, bookkeeping review, reconciliation, VAT and WHT reporting, and workspace management with the team.",
    href: "mailto:hello@taxbook.africa?subject=Book%20a%20TaxBook%20Demo",
    cta: "Book Demo",
  },
  {
    icon: Mail,
    title: "Contact sales",
    description:
      "Discuss plan fit for a single business, a finance team, or a multi-client accounting practice.",
    href: "mailto:hello@taxbook.africa?subject=TaxBook%20Sales%20Inquiry",
    cta: "Email Sales",
  },
  {
    icon: Headphones,
    title: "Get rollout support",
    description:
      "Use this path for onboarding questions, migration planning, or help structuring your operating model.",
    href: "mailto:hello@taxbook.africa?subject=TaxBook%20Launch%20Support",
    cta: "Contact Support",
  },
];

export const CONTACT_EXPECTATIONS = [
  "Typical response target: within one business day for product, sales, and rollout enquiries.",
  "Primary launch focus: Nigerian businesses, finance teams, and accounting firms.",
  "Best-fit conversations: founders, finance leads, controllers, and accounting practice operators.",
];

export const CONTACT_CHECKLIST = [
  {
    icon: Clock3,
    title: "Share your current workflow",
    description:
      "Tell us how you handle receipts, invoices, banking, and tax reporting today so the conversation stays grounded.",
  },
  {
    icon: Users,
    title: "Outline who needs access",
    description:
      "Plan fit depends on how many operators, reviewers, businesses, or client entities need to collaborate.",
  },
  {
    icon: MapPin,
    title: "Flag any tax or reporting constraints",
    description:
      "That helps us frame the right rollout approach for VAT, WHT, close processes, and migration expectations.",
  },
];
