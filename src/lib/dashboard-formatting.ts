function shouldShowDecimals(amountMinor: number) {
  return Math.abs(amountMinor) % 100 !== 0;
}

function isDisplayCurrency(value: string) {
  return /^[A-Z]{3}$/.test(value) && value !== "MIXED";
}

function formatNumberValue(value: number, compact = false) {
  return new Intl.NumberFormat("en-NG", {
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 2,
    minimumFractionDigits: compact ? 0 : 2,
  }).format(value);
}

export function formatCurrencyNGN(amountMinor: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: shouldShowDecimals(amountMinor) ? 2 : 0,
    maximumFractionDigits: shouldShowDecimals(amountMinor) ? 2 : 0,
  }).format(amountMinor / 100);
}

export function formatCompactCurrencyNGN(amountMinor: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    currencyDisplay: "narrowSymbol",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amountMinor / 100);
}

export function formatDashboardCurrency(amountMinor: number, currency: string) {
  const normalizedCurrency = currency.trim().toUpperCase();

  if (!isDisplayCurrency(normalizedCurrency)) {
    return `${formatNumberValue(amountMinor / 100)} ${normalizedCurrency || "NGN"}`;
  }

  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: normalizedCurrency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: shouldShowDecimals(amountMinor) ? 2 : 0,
    maximumFractionDigits: shouldShowDecimals(amountMinor) ? 2 : 0,
  }).format(amountMinor / 100);
}

export function formatCompactDashboardCurrency(amountMinor: number, currency: string) {
  const normalizedCurrency = currency.trim().toUpperCase();

  if (!isDisplayCurrency(normalizedCurrency)) {
    return `${formatNumberValue(amountMinor / 100, true)} ${normalizedCurrency || "NGN"}`;
  }

  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: normalizedCurrency,
    currencyDisplay: "narrowSymbol",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amountMinor / 100);
}

export function formatDashboardDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
