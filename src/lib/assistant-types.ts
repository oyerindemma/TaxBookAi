export type AssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantMetric = {
  label: string;
  value: string;
  detail: string;
};

export type AssistantCitation = {
  id: string;
  kind:
    | "summary"
    | "bank_transaction"
    | "review_item"
    | "category_suggestion"
    | "tax_summary"
    | "alert"
    | "client_business"
    | "filing_blocker";
  title: string;
  detail: string;
  href: string | null;
  badge: string | null;
};

export type AssistantAction = {
  id: string;
  label: string;
  href: string;
  description: string;
  intent: "navigate" | "review" | "confirm";
};

export type AssistantQuickInsight = {
  id: string;
  title: string;
  summary: string;
  tone: "default" | "secondary" | "outline" | "destructive";
  href: string;
  ctaLabel: string;
};

export type AssistantWorkspaceContextStatus = "empty" | "partial" | "ready";

export type AssistantContextTransaction = {
  id: number;
  transactionDate: string;
  description: string;
  reference: string | null;
  amountMinor: number;
  type: "CREDIT" | "DEBIT";
  currency: string;
  bankAccountName: string;
  clientBusinessName: string | null;
  reviewStatus: string | null;
  postingReadiness: string | null;
  categoryName: string | null;
  suggestedCategoryName: string | null;
  suggestionConfidence: number | null;
  suggestionReason: string | null;
  reviewNotes: string | null;
};

export type AssistantWorkspaceContext = {
  workspace: {
    id: number;
    name: string;
    defaultCurrency: string;
    generatedAt: string;
    status: AssistantWorkspaceContextStatus;
  };
  overview: {
    currentPeriodLabel: string;
    transactionCount: number;
    currentPeriodTransactionCount: number;
    pendingReviewCount: number;
    flaggedCount: number;
    uncategorizedCount: number;
    suggestedCategoryCount: number;
    lowConfidenceSuggestionCount: number;
    totalIncomeMinor: number;
    totalExpenseMinor: number;
    netFlowMinor: number;
  };
  tax: {
    status: AssistantWorkspaceContextStatus;
    dateLabel: string;
    vatDueMinor: number;
    whtDueMinor: number;
    totalTaxDueMinor: number;
    provisional: boolean;
    transactionCount: number;
    explanation: string | null;
  };
  review: {
    pendingCount: number;
    flaggedCount: number;
    reviewRequiredCount: number;
    items: AssistantContextTransaction[];
  };
  categorization: {
    uncategorizedCount: number;
    suggestedCount: number;
    lowConfidenceCount: number;
    items: AssistantContextTransaction[];
  };
  recentTransactions: AssistantContextTransaction[];
  clientBusinesses: Array<{
    id: number;
    name: string;
    defaultCurrency: string;
  }>;
  alerts: {
    openCount: number;
    criticalCount: number;
    items: Array<{
      id: number;
      title: string;
      message: string;
      severity: string;
      status: string;
      href: string | null;
      clientBusinessName: string | null;
    }>;
  };
  analytics: {
    summary: string;
    expensesDeltaMinor: number;
    netProfitDeltaMinor: number;
    topCategoryDriver: {
      label: string;
      deltaMinor: number;
    } | null;
    topVendorDriver: {
      label: string;
      deltaMinor: number;
    } | null;
    filingNarrative: string | null;
    filingBlockerCount: number;
  };
  warnings: string[];
};

export type AssistantHomeState = {
  aiEnabled: boolean;
  summary: string;
  suggestedPrompts: string[];
  quickInsights: AssistantQuickInsight[];
};

export type AssistantAnswerDraft = {
  answer: string;
  metrics: AssistantMetric[];
  citations: AssistantCitation[];
  actions: AssistantAction[];
  warnings: string[];
  suggestedPrompts: string[];
  incompleteData: boolean;
  status: AssistantWorkspaceContextStatus;
  sectionLabels: string[];
};

export type AssistantChatResponse = {
  answer: string;
  metrics: AssistantMetric[];
  citations: AssistantCitation[];
  actions: AssistantAction[];
  warnings: string[];
  suggestedPrompts: string[];
  mode: "openai" | "fallback";
  provider: "openai" | "rules";
  aiEnabled: boolean;
  incompleteData: boolean;
  status: AssistantWorkspaceContextStatus;
  auditMetadata: Record<string, unknown>;
};
