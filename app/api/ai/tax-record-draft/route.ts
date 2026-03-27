import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { enforceAiScanLimit, getWorkspaceFeatureAccess } from "@/lib/billing";
import {
  BOOKKEEPING_CATEGORY_GUIDANCE,
  buildFallbackTextSuggestion,
  buildLegacyTaxRecordDraft,
  extractOutputText,
  normalizeBookkeepingSuggestion,
} from "@/lib/bookkeeping-ai";
import { getOpenAiServerConfig, hasOpenAiServerConfig } from "@/lib/env";
import { logRouteError } from "@/lib/logger";
import { NIGERIA_TAX_CONFIG } from "@/lib/nigeria-tax-config";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "VIEWER");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const featureAccess = await getWorkspaceFeatureAccess(ctx.workspaceId, "AI_ASSISTANT");
  if (!featureAccess.ok) {
    return NextResponse.json(
      {
        error: featureAccess.error,
        currentPlan: featureAccess.plan,
        requiredPlan: featureAccess.requiredPlan,
      },
      { status: 402 }
    );
  }
  const aiScanLimit = await enforceAiScanLimit(ctx.workspaceId, 1);
  if (!aiScanLimit.ok) {
    return NextResponse.json(
      {
        error: aiScanLimit.error,
        currentPlan: aiScanLimit.plan,
        maxAiScansPerMonth: aiScanLimit.max,
        currentAiScansThisMonth: aiScanLimit.current,
        recommendedPlan: aiScanLimit.recommendedPlan,
      },
      { status: 402 }
    );
  }

  try {
    const body = await req.json();
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    if (text.length > 5000) {
      return NextResponse.json(
        { error: "text must be 5000 characters or less" },
        { status: 400 }
      );
    }

    if (!hasOpenAiServerConfig()) {
      const suggestion = buildFallbackTextSuggestion(text);
      const draft = buildLegacyTaxRecordDraft(suggestion);
      const metadata = {
        version: 1 as const,
        provider: "heuristic-fallback" as const,
        route: "tax-record-draft" as const,
        model: null,
        sourceType: "text" as const,
        generatedAt: new Date().toISOString(),
        warnings: ["OPENAI_API_KEY is not configured. Using local bookkeeping heuristics."],
      };

      await logAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        action: "AI_BOOKKEEPING_SUGGESTION_GENERATED",
        metadata: {
          route: metadata.route,
          sourceType: metadata.sourceType,
          provider: metadata.provider,
          fallback: true,
        },
      });

      return NextResponse.json({
        available: false,
        suggestion,
        draft,
        metadata,
      });
    }

    const { apiKey, model } = getOpenAiServerConfig();

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        classification: {
          type: "string",
          enum: ["INCOME", "EXPENSE"],
        },
        amount: {
          type: ["number", "null"],
          description: "Amount in major currency units (for example 1234.56)",
        },
        currency: {
          type: "string",
          description: "ISO currency code, default NGN",
        },
        transactionDate: {
          type: ["string", "null"],
          description: "Transaction date in YYYY-MM-DD format",
        },
        description: {
          type: "string",
          description: "Short bookkeeping summary",
        },
        suggestedCategory: {
          type: ["string", "null"],
          description: "Suggested expense category name when relevant",
        },
        vendorName: {
          type: ["string", "null"],
          description: "Vendor, merchant, customer, or payee when identifiable",
        },
        vat: {
          type: "object",
          additionalProperties: false,
          properties: {
            relevance: {
              type: "string",
              enum: ["RELEVANT", "NOT_RELEVANT", "UNCERTAIN"],
            },
            suggestedRate: {
              type: "number",
              description: `Suggested VAT rate percentage. Use ${NIGERIA_TAX_CONFIG.vat.standardRate} for standard Nigerian VAT when clearly applicable.`,
            },
            reason: {
              type: "string",
              description: "Short reason for the VAT suggestion",
            },
          },
          required: ["relevance", "suggestedRate", "reason"],
        },
        wht: {
          type: "object",
          additionalProperties: false,
          properties: {
            relevance: {
              type: "string",
              enum: ["RELEVANT", "NOT_RELEVANT", "UNCERTAIN"],
            },
            suggestedRate: {
              type: "number",
              description: "Suggested WHT rate percentage when clearly supported, otherwise 0.",
            },
            reason: {
              type: "string",
              description: "Short reason for the WHT suggestion",
            },
          },
          required: ["relevance", "suggestedRate", "reason"],
        },
        confidence: {
          type: "string",
          enum: ["HIGH", "MEDIUM", "LOW"],
        },
        notes: {
          type: "array",
          items: { type: "string" },
          maxItems: 5,
        },
      },
      required: [
        "classification",
        "amount",
        "currency",
        "transactionDate",
        "description",
        "suggestedCategory",
        "vendorName",
        "vat",
        "wht",
        "confidence",
        "notes",
      ],
    };

    const prompt =
      "You are a bookkeeping extraction assistant for TaxBook AI, a Nigerian business bookkeeping product. " +
      "Read the transaction text and return a conservative bookkeeping suggestion. " +
      "Classify the transaction as INCOME or EXPENSE. " +
      "Extract vendorName, amount, currency, transactionDate, description, and suggestedCategory when possible. " +
      "Assess VAT and WHT relevance for Nigerian businesses. " +
      "Use VAT relevance RELEVANT only when VAT is explicit or strongly implied; otherwise use UNCERTAIN or NOT_RELEVANT. " +
      "Use WHT relevance RELEVANT only when withholding is explicit or the transaction clearly looks like a service or contract payment; otherwise prefer UNCERTAIN or NOT_RELEVANT. " +
      "If no amount is visible, return null for amount. " +
      "Use NGN when currency is missing. " +
      `Treat ${NIGERIA_TAX_CONFIG.vat.standardRate}% as the standard VAT rate when VAT clearly applies. ` +
      `${BOOKKEEPING_CATEGORY_GUIDANCE} ` +
      "Keep notes brief and practical.\n\nTransaction text:\n" +
      text;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: prompt,
        temperature: 0.2,
        text: {
          format: {
            type: "json_schema",
            name: "tax_record_draft",
            strict: true,
            schema,
          },
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error?.message ?? "AI request failed" },
        { status: 500 }
      );
    }

    const outputText = extractOutputText(data);
    if (!outputText) {
      return NextResponse.json(
        { error: "AI response missing output" },
        { status: 500 }
      );
    }

    let draft: unknown;
    try {
      draft = JSON.parse(outputText);
    } catch {
      return NextResponse.json(
        { error: "AI response was not valid JSON" },
        { status: 500 }
      );
    }

    const suggestion = normalizeBookkeepingSuggestion(draft);
    const legacyDraft = buildLegacyTaxRecordDraft(suggestion);
    const metadata = {
      version: 1 as const,
      provider: "openai" as const,
      route: "tax-record-draft" as const,
      model,
      sourceType: "text" as const,
      generatedAt: new Date().toISOString(),
      warnings: [] as string[],
    };

    await logAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "AI_BOOKKEEPING_SUGGESTION_GENERATED",
      metadata: {
        route: metadata.route,
        sourceType: metadata.sourceType,
        provider: metadata.provider,
        confidence: suggestion.confidence,
      },
    });

    return NextResponse.json({
      available: true,
      suggestion,
      draft: legacyDraft,
      metadata,
    });
  } catch (error) {
    logRouteError("ai tax record draft failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return NextResponse.json(
      { error: "Server error generating draft" },
      { status: 500 }
    );
  }
}
