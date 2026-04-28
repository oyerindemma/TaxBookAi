import type { Metadata } from "next";

const DEFAULT_SITE_URL = "https://taxbook.africa";
const DEFAULT_DESCRIPTION =
  "TaxBook AI is AI accounting software for Nigerian businesses and accounting firms, with receipt scanning, bookkeeping review, bank reconciliation, VAT and WHT automation, and audit-friendly workspaces.";
const DEFAULT_KEYWORDS = [
  "AI accounting software Nigeria",
  "bookkeeping software for accounting firms",
  "VAT and WHT automation",
  "accounting software for Nigerian businesses",
  "bank reconciliation software Nigeria",
  "AI receipt scanning Nigeria",
];

export function getMarketingSiteUrl() {
  const configuredUrl = process.env.APP_URL?.trim();

  try {
    return new URL(configuredUrl && configuredUrl.length > 0 ? configuredUrl : DEFAULT_SITE_URL);
  } catch {
    return new URL(DEFAULT_SITE_URL);
  }
}

type BuildMarketingMetadataInput = {
  title: string;
  description?: string;
  path?: string;
  keywords?: string[];
};

export function buildMarketingMetadata({
  title,
  description = DEFAULT_DESCRIPTION,
  path = "/",
  keywords = [],
}: BuildMarketingMetadataInput): Metadata {
  const siteUrl = getMarketingSiteUrl();
  const url = new URL(path, siteUrl);
  const imageUrl = new URL("/opengraph-image", siteUrl);

  return {
    title,
    description,
    keywords: Array.from(new Set([...DEFAULT_KEYWORDS, ...keywords])),
    alternates: {
      canonical: url.toString(),
    },
    openGraph: {
      type: "website",
      locale: "en_NG",
      url: url.toString(),
      siteName: "TaxBook AI",
      title: `TaxBook AI | ${title}`,
      description,
      images: [
        {
          url: imageUrl.toString(),
          width: 1200,
          height: 630,
          alt: "TaxBook AI marketing preview",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `TaxBook AI | ${title}`,
      description,
      images: [imageUrl.toString()],
    },
  };
}
