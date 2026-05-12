import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import CookieConsentBanner from "@/app/_components/CookieConsentBanner";
import TaxBookOfflineRuntime from "@/app/_components/TaxBookOfflineRuntime";
import { getMarketingSiteUrl } from "@/lib/marketing-metadata";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: getMarketingSiteUrl(),
  title: {
    default: "TaxBook AI",
    template: "%s | TaxBook AI",
  },
  description:
    "TaxBook AI is AI accounting software for Nigerian businesses and accounting firms, with receipt scanning, bookkeeping review, bank reconciliation, VAT and WHT automation, and audit-friendly workspaces.",
  openGraph: {
    type: "website",
    locale: "en_NG",
    siteName: "TaxBook AI",
    title: "TaxBook AI",
    description:
      "AI accounting software for Nigerian businesses and accounting firms, with receipt scanning, reconciliation, VAT and WHT summaries, and audit-friendly workspaces.",
  },
  twitter: {
    card: "summary_large_image",
    title: "TaxBook AI",
    description:
      "AI accounting software for Nigerian businesses and accounting firms, with receipt scanning, reconciliation, VAT and WHT summaries, and audit-friendly workspaces.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        <TaxBookOfflineRuntime />
        <CookieConsentBanner />
        {children}
      </body>
    </html>
  );
}
