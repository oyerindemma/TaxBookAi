import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TaxBook AI",
  description:
    "TaxBook AI helps finance teams automate bookkeeping, stay tax-ready, and move from receipts to reporting in one workspace.",
};

const navLinks = [
  { href: "/login", label: "Login" },
  { href: "/signup", label: "Sign up" },
  { href: "/pricing", label: "Pricing" },
] as const;

const featureCards = [
  {
    title: "Bookkeeping workflows",
    description: "Organize receipts, expenses, and review queues without relying on scattered tools.",
  },
  {
    title: "Tax-ready records",
    description: "Keep VAT, WHT, and supporting records visible so compliance work is easier to manage.",
  },
  {
    title: "One shared workspace",
    description: "Give founders, accountants, and finance teams a clear operating view of the business.",
  },
] as const;

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="text-xl font-semibold tracking-tight">
            TaxBook AI
          </Link>

          <nav className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full border border-slate-800 px-4 py-2 transition hover:border-slate-600 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </header>

        <section className="flex flex-1 items-center py-16 sm:py-24">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center">
            <div className="space-y-8">
              <div className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
                AI bookkeeping and tax operations for modern teams
              </div>

              <div className="space-y-5">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                  Keep your books current and your tax workflow under control.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-slate-300">
                  TaxBook AI gives businesses a clean operating layer for bookkeeping, compliance,
                  and financial visibility, without changing the rest of the product surface.
                </p>
              </div>

              <div className="flex flex-wrap gap-4">
                <Link
                  href="/signup"
                  className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-emerald-300"
                >
                  Start with TaxBook AI
                </Link>
                <Link
                  href="/pricing"
                  className="rounded-full border border-slate-700 px-5 py-3 text-sm font-medium text-slate-100 transition hover:border-slate-500"
                >
                  View pricing
                </Link>
                <Link
                  href="/login"
                  className="rounded-full border border-transparent px-5 py-3 text-sm font-medium text-slate-300 transition hover:text-white"
                >
                  Existing customer login
                </Link>
              </div>
            </div>

            <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/40">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
                Why teams choose TaxBook AI
              </p>
              <div className="mt-6 grid gap-4">
                {featureCards.map((card) => (
                  <div key={card.title} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
                    <h2 className="text-lg font-semibold text-white">{card.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{card.description}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
