import Link from "next/link";
import { ShieldCheck, WalletCards, FileText } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PortalPageProps = {
  searchParams: Promise<{
    state?: string;
  }>;
};

function resolveMessage(state?: string) {
  switch (state) {
    case "expired":
      return {
        title: "This secure invoice link has expired",
        description: "Ask the sender to share a fresh invoice portal link so you can continue.",
      };
    case "missing":
      return {
        title: "That invoice is no longer available",
        description: "The invoice may have been removed or replaced with a newer version.",
      };
    case "not_ready":
      return {
        title: "This invoice is not ready for client access yet",
        description: "The sender still needs to issue the invoice before it can be viewed here.",
      };
    case "invalid":
      return {
        title: "We couldn’t verify this invoice link",
        description: "Use the secure link from your email or ask the sender to resend it.",
      };
    default:
      return {
        title: "Client portal",
        description: "Open the secure invoice link from your email to view, print, and pay your invoice.",
      };
  }
}

export default async function PortalPage({ searchParams }: PortalPageProps) {
  const { state } = await searchParams;
  const message = resolveMessage(state);

  return (
    <main className="min-h-screen bg-primary px-6 py-12 text-white">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan">
              TaxBook AI client portal
            </p>
            <h1 className="text-4xl font-semibold tracking-tight">{message.title}</h1>
            <p className="max-w-2xl text-base text-slate-300">{message.description}</p>
          </div>

          <Card className="rounded-2xl border border-cyan/20 bg-primary text-white shadow-glow">
            <CardHeader>
              <CardTitle>What you can do here</CardTitle>
              <CardDescription className="text-slate-300">
                Every invoice link is designed to feel clear, trustworthy, and mobile-friendly.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <ShieldCheck className="size-5 text-cyan" />
                <p className="mt-3 font-medium text-white">Secure invoice access</p>
                <p className="mt-2 text-sm text-slate-300">
                  Your invoice link is verified server-side before any billing details are shown.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <WalletCards className="size-5 text-cyan" />
                <p className="mt-3 font-medium text-white">Pay online with Paystack</p>
                <p className="mt-2 text-sm text-slate-300">
                  Checkout uses the existing TaxBook AI payment flow with NGN-ready pricing.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <FileText className="size-5 text-cyan" />
                <p className="mt-3 font-medium text-white">Print or save your invoice</p>
                <p className="mt-2 text-sm text-slate-300">
                  You can print the invoice or save it as PDF from your browser when needed.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <Card className="rounded-2xl border border-white/10 bg-primary text-white shadow-glow">
          <CardHeader>
            <CardTitle>Need help?</CardTitle>
            <CardDescription className="text-slate-300">
              If the link is missing or expired, the sender can generate a fresh secure portal link
              without changing your invoice.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              Repeat-client accounts are not enabled yet in this workspace, so access is currently
              handled through secure magic links instead of a username and password.
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              If you already received a link, reopen it from your email or message thread to jump
              straight into your invoice portal.
            </div>
            <Link
              href="/"
              className="inline-flex rounded-xl bg-gradient-primary px-4 py-2 text-sm font-medium text-white shadow-glow transition hover:opacity-90"
            >
              Back to TaxBook AI
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
