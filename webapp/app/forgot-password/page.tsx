import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { redirectIfAuthenticated } from "@/lib/auth";
import ForgotPasswordForm from "./ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Forgot Password",
  description: "Request a secure TaxBook password reset link.",
};

export default async function ForgotPasswordPage() {
  await redirectIfAuthenticated();

  return (
    <MarketingShell>
      <ForgotPasswordForm />
    </MarketingShell>
  );
}
