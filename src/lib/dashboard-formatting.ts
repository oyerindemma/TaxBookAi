function shouldShowDecimals(amountMinor: number) {
  return Math.abs(amountMinor) % 100 !== 0;
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

export function formatDashboardDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
