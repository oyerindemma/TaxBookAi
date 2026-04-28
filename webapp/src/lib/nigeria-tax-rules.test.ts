import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateNigeriaCit,
  getNigeriaCitBand,
  getNigeriaVatRate,
  getNigeriaWhtRate,
  resolveNigerianTaxOutputStatus,
} from "./nigeria-tax-rules";

test("VAT uses the effective dated 7.5% rate from 1 February 2020", () => {
  assert.equal(getNigeriaVatRate("2020-01-31"), 5);
  assert.equal(getNigeriaVatRate("2020-02-01"), 7.5);
  assert.equal(getNigeriaVatRate("2026-04-28"), 7.5);
});

test("WHT rates use the 2025 effective-date schedule for common SME services", () => {
  assert.equal(getNigeriaWhtRate("PROFESSIONAL_SERVICE", "2024-12-31"), 10);
  assert.equal(getNigeriaWhtRate("PROFESSIONAL_SERVICE", "2025-01-01"), 5);
  assert.equal(getNigeriaWhtRate("PURCHASE_SERVICES", "2025-01-01"), 2);
  assert.equal(getNigeriaWhtRate("RENT", "2025-01-01"), 10);
});

test("CIT company bands classify small, medium, and large Nigerian companies", () => {
  assert.equal(getNigeriaCitBand(24_999_999_00, "2026-04-28").band, "SMALL");
  assert.equal(getNigeriaCitBand(25_000_001_00, "2026-04-28").band, "MEDIUM");
  assert.equal(getNigeriaCitBand(100_000_000_00, "2026-04-28").band, "MEDIUM");
  assert.equal(getNigeriaCitBand(100_000_001_00, "2026-04-28").band, "LARGE");
});

test("CIT estimates use visible turnover band and positive tax-adjusted profit", () => {
  assert.deepEqual(
    {
      band: estimateNigeriaCit({
        annualTurnoverMinor: 80_000_000_00,
        taxAdjustedProfitMinor: 12_000_000_00,
        occurredOn: "2026-04-28",
      }).band,
      rate: estimateNigeriaCit({
        annualTurnoverMinor: 80_000_000_00,
        taxAdjustedProfitMinor: 12_000_000_00,
        occurredOn: "2026-04-28",
      }).rate,
      estimatedCitMinor: estimateNigeriaCit({
        annualTurnoverMinor: 80_000_000_00,
        taxAdjustedProfitMinor: 12_000_000_00,
        occurredOn: "2026-04-28",
      }).estimatedCitMinor,
    },
    {
      band: "MEDIUM",
      rate: 20,
      estimatedCitMinor: 2_400_000_00,
    }
  );

  assert.equal(
    estimateNigeriaCit({
      annualTurnoverMinor: 120_000_000_00,
      taxAdjustedProfitMinor: -1_000_000_00,
      occurredOn: "2026-04-28",
    }).estimatedCitMinor,
    0
  );
});

test("tax output statuses are explicit for estimate, review, filing-ready, and filed states", () => {
  assert.equal(
    resolveNigerianTaxOutputStatus({
      sourceCount: 2,
      exceptionCount: 0,
      isEstimate: true,
    }),
    "estimate"
  );
  assert.equal(
    resolveNigerianTaxOutputStatus({
      sourceCount: 2,
      exceptionCount: 1,
    }),
    "review-needed"
  );
  assert.equal(
    resolveNigerianTaxOutputStatus({
      sourceCount: 2,
      exceptionCount: 0,
    }),
    "filing-ready"
  );
  assert.equal(
    resolveNigerianTaxOutputStatus({
      sourceCount: 2,
      exceptionCount: 0,
      filed: true,
    }),
    "filed"
  );
});
