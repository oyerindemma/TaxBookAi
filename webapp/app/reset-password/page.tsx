import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { validatePasswordResetToken } from "@/lib/auth";
import ResetPasswordForm from "./ResetPasswordForm";

type ResetPasswordPageProps = {
  searchParams: Promise<{
    token?: string;
  }>;
};

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Choose a new password for your TaxBook account.",
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const { token } = await searchParams;
  const validation = await validatePasswordResetToken(token);

  return (
    <MarketingShell>
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,0.8fr)] lg:items-center">
          <div className="space-y-5">
            <h1 className="text-5xl font-semibold tracking-tight text-balance text-white">
              Secure your account with a fresh password.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-white/65">
              Reset links are single-use and expire automatically, so you can recover access
              without exposing the rest of your account.
            </p>
          </div>

          {validation.ok ? (
            <ResetPasswordForm token={token?.trim() ?? ""} />
          ) : (
            <Card className="border-white/10 bg-white/5 text-white shadow-glow backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-white">Reset link unavailable</CardTitle>
                <CardDescription className="text-white/60">{validation.error}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-white/60">
                <p>Request a fresh password reset link to continue.</p>
                <Link
                  href="/forgot-password"
                  className="font-medium text-white underline-offset-4 hover:underline"
                >
                  Request a new reset link
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </MarketingShell>
  );
}
