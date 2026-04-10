import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  COMPANY_DETAILS,
  MARKETING_HEADLINE,
  MARKETING_NAME,
} from "@/components/marketing/site-content";
import { phoneHref, phoneNumber, supportEmail, supportEmailHref } from "@/lib/config/contact";

const PRODUCT_LINKS = [
  { href: "/#features", label: "AI bookkeeping" },
  { href: "/#workflow", label: "Transaction workflows" },
  { href: "/#comparison", label: "VAT/WHT tax engine" },
  { href: "/#audiences", label: "Accountant workspace" },
  { href: "/#preview", label: "Product preview" },
] as const;

const COMPANY_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Book Demo" },
  { href: "/login", label: "Login" },
] as const;

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/cookies", label: "Cookies" },
  { href: "/dpa", label: "DPA" },
] as const;

export function PublicFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#070b13]">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.75fr_0.75fr_0.8fr_0.95fr]">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-primary text-sm font-semibold text-white shadow-glow">
                TB
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{MARKETING_NAME}</p>
                <p className="text-sm text-white/60">{MARKETING_HEADLINE}</p>
              </div>
            </div>
            <p className="max-w-xl text-sm leading-6 text-white/60">
              TaxBook AI combines AI receipt scanning, bookkeeping review, bank reconciliation,
              VAT and WHT summaries, filing-ready tax workflows, multi-business workspaces, and
              audit-friendly review in one Nigeria-first finance operating layer.
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge className="border border-white/10 bg-white/5 text-white hover:bg-white/5">
                Workspace-scoped
              </Badge>
              <Badge className="border border-white/10 bg-white/5 text-white hover:bg-white/5">
                VAT/WHT ready
              </Badge>
              <Badge className="border border-white/10 bg-white/5 text-white hover:bg-white/5">
                Filing-ready
              </Badge>
              <Badge className="border border-white/10 bg-white/5 text-white hover:bg-white/5">
                AI-assisted capture
              </Badge>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-white">Product</p>
            <div className="grid gap-2 text-sm text-white/60">
              {PRODUCT_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="transition hover:text-white">
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-white">Company</p>
            <div className="grid gap-2 text-sm text-white/60">
              {COMPANY_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="transition hover:text-white">
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-white">Legal</p>
            <div className="grid gap-2 text-sm text-white/60">
              {LEGAL_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="transition hover:text-white">
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-3">
              <p className="text-sm font-semibold text-white">Contact</p>
              <div className="grid gap-2 text-sm text-white/60">
                <a
                  href={supportEmailHref}
                  className="transition hover:text-white"
                >
                  {supportEmail}
                </a>
                <a
                  href={phoneHref}
                  className="transition hover:text-white"
                >
                  {phoneNumber}
                </a>
                <span>{COMPANY_DETAILS.location}</span>
                <span className="text-white/45">
                  Built for Nigerian businesses, finance teams, and accounting firms.
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                asChild
                size="sm"
                variant="outline"
                className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/pricing">View Pricing</Link>
              </Button>
              <Button
                asChild
                size="sm"
                className="border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
              >
                <Link href="/signup">Start Free Trial</Link>
              </Button>
            </div>
          </div>
        </div>

        <Separator className="my-6 bg-white/10" />

        <div className="flex flex-col gap-2 text-sm text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Built for Nigerian businesses, finance teams, and accounting firms that need credible
            books before filing deadlines.
          </p>
          <p>© 2026 TaxBook AI. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
