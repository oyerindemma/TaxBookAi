import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { enforceAiScanLimit, getWorkspaceFeatureAccess } from "@/lib/billing";
import {
  BOOKKEEPING_CATEGORY_GUIDANCE,
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
    const formData = await req.formData();
    const file = formData.get("image");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "image is required" }, { status: 400 });
    }
    if (!file.type?.startsWith("image/")) {
      return NextResponse.json({ error: "image must be a valid image file" }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "image must be 5MB or smaller" },
        { status: 400 }
      );
    }

    if (!hasOpenAiServerConfig()) {
      const metadata = {
        version: 1 as const,
        provider: "unavailable" as const,
        route: "receipt-scan" as const,
        model: null,
        sourceType: "receipt-image" as const,
        generatedAt: new Date().toISOString(),
        fileName: file.name || null,
        warnings: [
          "OPENAI_API_KEY is not configured. Receipt image analysis is unavailable. Paste transaction text instead.",
        ],
      };

      await logAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        action: "AI_BOOKKEEPING_SUGGESTION_GENERATED",
        metadata: {
          route: metadata.route,
          sourceType: metadata.sourceType,
          provider: metadata.provider,
          available: false,
        },
      });

      return NextResponse.json({
        available: false,
        suggestion: null,
        draft: null,
        metadata,
      });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type || "image/jpeg";
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const { apiKey, visionModel: model } = getOpenAiServerConfig();

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        amount: {
          type: ["number", "null"],
          description: "Total amount in major currency units (for example 1234.56)",
        },
        classification: {
          type: "string",
          enum: ["INCOME", "EXPENSE"],
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
          description: "Suggested expense category when relevant",
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
            },
            reason: {
              type: "string",
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
            },
            reason: {
              type: "string",
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
        "amount",
        "classification",
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
      "Analyze the uploaded receipt or proof-of-payment image and return a conservative bookkeeping suggestion. " +
      "Classify the transaction as INCOME or EXPENSE. " +
      "Extract vendorName, amount, currency, transactionDate, description, and suggestedCategory when possible. " +
      "Assess VAT and WHT relevance for Nigerian businesses. " +
      "Use NGN if the currency is not visible. " +
      `Use ${NIGERIA_TAX_CONFIG.vat.standardRate}% as the standard VAT rate when VAT clearly applies. ` +
      "If the amount or date is unreadable, return null for that field rather than guessing. " +
      "If the classification is unclear, choose EXPENSE. " +
      `${BOOKKEEPING_CATEGORY_GUIDANCE} ` +
      "Keep notes brief and practical.";

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: dataUrl },
            ],
          },
        ],
        temperature: 0.2,
        text: {
          format: {
            type: "json_schema",
            name: "receipt_scan",
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
      route: "receipt-scan" as const,
      model,
      sourceType: "receipt-image" as const,
      generatedAt: new Date().toISOString(),
      fileName: file.name || null,
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
    logRouteError("ai receipt scan failed", error, {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
    });
    return NextResponse.json(
      { error: "Server error scanning receipt" },
      { status: 500 }
    );
  }
}
