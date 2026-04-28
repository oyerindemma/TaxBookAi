export type ExplainMyNumbersMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ExplainMyNumbersMetric = {
  label: string;
  value: string;
  detail: string;
};

export type ExplainMyNumbersSource = {
  id: string;
  kind:
    | "summary"
    | "bank_transaction"
    | "ledger_transaction"
    | "tax_driver"
    | "filing_blocker"
    | "category"
    | "vendor";
  title: string;
  detail: string;
  href: string | null;
  badge: string | null;
};

export type ExplainMyNumbersAction = {
  id: string;
  label: string;
  href: string;
  description: string;
  intent: "navigate" | "review" | "confirm";
};

export type ExplainMyNumbersQuickInsight = {
  id: string;
  title: string;
  summary: string;
  tone: "default" | "secondary" | "outline" | "destructive";
  href: string;
  ctaLabel: string;
};

export type ExplainMyNumbersHomeState = {
  aiEnabled: boolean;
  quickInsights: ExplainMyNumbersQuickInsight[];
  suggestedPrompts: string[];
  summary: string;
};

export type ExplainMyNumbersAnswer = {
  answer: string;
  supportingMetrics: ExplainMyNumbersMetric[];
  toolsInvoked: string[];
  sources: ExplainMyNumbersSource[];
  followUpActions: ExplainMyNumbersAction[];
  warnings: string[];
  mode: "openai" | "fallback";
  provider: "openai" | "rules";
  aiEnabled: boolean;
  requiresConfirmation: boolean;
  incompleteData: boolean;
  suggestedPrompts: string[];
  auditMetadata: Record<string, unknown>;
};

export type ExplainMyNumbersPeriodPreset =
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "THIS_QUARTER"
  | "LAST_QUARTER"
  | "THIS_YEAR"
  | "LAST_30_DAYS"
  | "THIS_WEEK";

export type ExplainMyNumbersPeriodRange = {
  preset: ExplainMyNumbersPeriodPreset;
  label: string;
  from: Date;
  to: Date;
  fromParam: string;
  toParam: string;
};

export type ExplainMyNumbersDelta = {
  currentMinor: number;
  previousMinor: number;
  deltaMinor: number;
  deltaPercentage: number | null;
  direction: "UP" | "DOWN" | "FLAT" | "NEW";
};

export type ExplainMyNumbersContributionRow = {
  key: string;
  label: string;
  currentMinor: number;
  previousMinor: number;
  deltaMinor: number;
  currentCount: number;
  previousCount: number;
  sampleSources: ExplainMyNumbersSource[];
};

export type ExplainMyNumbersTaxDriver = {
  key: string;
  label: string;
  taxType: "VAT" | "WHT";
  amountMinor: number;
  changeMinor: number | null;
  reason: string;
};

export type ExplainMyNumbersAnalyticsSnapshot = {
  currency: string;
  period: {
    current: ExplainMyNumbersPeriodRange;
    previous: ExplainMyNumbersPeriodRange | null;
  };
  overview: {
    revenue: ExplainMyNumbersDelta;
    expenses: ExplainMyNumbersDelta;
    netProfit: ExplainMyNumbersDelta;
    currentTransactionCount: number;
    previousTransactionCount: number;
  };
  expenseChange: {
    topCategories: ExplainMyNumbersContributionRow[];
    topVendors: ExplainMyNumbersContributionRow[];
  };
  taxMovement: {
    currentTotalDueMinor: number;
    previousTotalDueMinor: number;
    deltaMinor: number;
    currentVatDueMinor: number;
    previousVatDueMinor: number;
    currentWhtDueMinor: number;
    previousWhtDueMinor: number;
    explanationSummary: string;
    topDrivers: ExplainMyNumbersTaxDriver[];
    sources: ExplainMyNumbersSource[];
  } | null;
  filingReadiness: {
    score: number;
    status: string;
    narrative: string;
    blockerCount: number;
    blockers: Array<{
      title: string;
      detail: string;
      severity: string;
      href: string;
    }>;
    recommendations: Array<{
      title: string;
      detail: string;
      href: string;
      actionLabel: string;
    }>;
  } | null;
};
