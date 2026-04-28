import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_REVIEW_DISCLAIMER,
  MESSY_BOOKKEEPING_FIXTURES,
  addAiSafetyToSuggestion,
  buildAiSuggestionMetadata,
  confidenceExplanation,
} from "./ai-production-safety";
import { buildFallbackTextSuggestion } from "./bookkeeping-ai";

test("AI safety metadata always carries review and fallback warnings", () => {
  const metadata = buildAiSuggestionMetadata({
    provider: "heuristic-fallback",
    route: "tax-record-draft",
    model: null,
    sourceType: "text",
  });

  assert.equal(metadata.provider, "heuristic-fallback");
  assert.ok(metadata.warnings.some((warning) => /not tax or legal advice/i.test(warning)));
  assert.ok(metadata.warnings.some((warning) => /fallback rules/i.test(warning)));
});

test("AI safety notes explain low confidence without overclaiming", () => {
  const suggestion = addAiSafetyToSuggestion({
    classification: "EXPENSE",
    suggestedCategory: null,
    vendorName: null,
    amount: null,
    currency: "NGN",
    transactionDate: "2026-04-28",
    description: "Unreadable receipt",
    vat: {
      relevance: "UNCERTAIN",
      suggestedRate: 7.5,
      reason: "VAT may apply but was not explicit.",
    },
    wht: {
      relevance: "NOT_RELEVANT",
      suggestedRate: 0,
      reason: "No WHT signal.",
    },
    confidence: "LOW",
    notes: [],
  });

  assert.ok(suggestion.notes.includes(AI_REVIEW_DISCLAIMER));
  assert.ok(suggestion.notes.includes(confidenceExplanation("LOW")));
  assert.ok(suggestion.notes.some((note) => /underlying document before filing/i.test(note)));
});

test("messy real-world bookkeeping fixtures stay conservative under local fallback", () => {
  for (const fixture of MESSY_BOOKKEEPING_FIXTURES) {
    const suggestion = buildFallbackTextSuggestion(fixture.input);
    assert.equal(
      suggestion.classification,
      fixture.expected.classification,
      `${fixture.id}: classification`
    );
    assert.equal(suggestion.currency, fixture.expected.currency, `${fixture.id}: currency`);
    assert.equal(suggestion.amount, fixture.expected.amount, `${fixture.id}: amount`);
    assert.equal(
      suggestion.suggestedCategory,
      fixture.expected.category,
      `${fixture.id}: category`
    );
    assert.equal(suggestion.vat.relevance, fixture.expected.vat, `${fixture.id}: VAT`);
    assert.equal(suggestion.wht.relevance, fixture.expected.wht, `${fixture.id}: WHT`);
    assert.equal(suggestion.confidence, "LOW", `${fixture.id}: fallback confidence`);
  }
});
