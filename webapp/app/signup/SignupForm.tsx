"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getSafeNextPath,
  parseAuthActionResponse,
} from "@/lib/auth-client";

type FieldErrors = Partial<
  Record<"fullName" | "email" | "password" | "confirmPassword" | "acceptedTerms", string>
>;

export default function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const nextPath = getSafeNextPath(searchParams.get("next"));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setMessage(null);
    setFieldErrors({});

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          password,
          confirmPassword,
          acceptedTerms,
        }),
      });

      const { data, fallbackText } =
        await parseAuthActionResponse<keyof FieldErrors>(res);

      if (!res.ok) {
        setMessage(
          data?.details?.trim() ||
            data?.error?.trim() ||
            fallbackText ||
            `Signup failed with status ${res.status}.`
        );
        setFieldErrors(data?.fieldErrors ?? {});
        return;
      }

      router.replace(nextPath ?? "/dashboard");
      router.refresh();
    } catch {
      setMessage("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,0.85fr)] lg:items-center">
        <div className="space-y-5">
          <Badge className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-white hover:bg-white/5">
            Start Free
          </Badge>
          <h1 className="text-5xl font-semibold tracking-tight text-balance text-white">
            Create your TaxBook AI workspace.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-white/65">
            Start with manual bookkeeping, invoices, VAT visibility, and reports, then upgrade when
            you need AI capture or reconciliation workflows.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="border-white/10 bg-white/5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.2)] backdrop-blur-xl">
              <CardHeader className="pb-3">
                <CardDescription className="text-white/55">Included from day one</CardDescription>
                <CardTitle className="text-lg text-white">Bookkeeping, invoices, VAT and WHT visibility</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-white/10 bg-white/5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.2)] backdrop-blur-xl">
              <CardHeader className="pb-3">
                <CardDescription className="text-white/55">Upgrade when you are ready</CardDescription>
                <CardTitle className="text-lg text-white">AI capture, reconciliation, and team workflows</CardTitle>
              </CardHeader>
            </Card>
          </div>
        </div>

        <Card className="border-white/10 bg-white/5 text-white shadow-glow backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white">Create account</CardTitle>
            <CardDescription className="text-white/60">
              Set up your account and continue into your TaxBook AI workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form onSubmit={onSubmit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="fullName" className="text-white/80">Full name</Label>
                <Input
                  id="fullName"
                  placeholder="Jane Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  aria-invalid={fieldErrors.fullName ? "true" : "false"}
                  className="border-white/10 bg-white/5 text-white placeholder:text-white/35"
                />
                {fieldErrors.fullName ? (
                  <p className="text-sm text-rose-300">{fieldErrors.fullName}</p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="email" className="text-white/80">Email</Label>
                <Input
                  id="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  aria-invalid={fieldErrors.email ? "true" : "false"}
                  className="border-white/10 bg-white/5 text-white placeholder:text-white/35"
                />
                {fieldErrors.email ? (
                  <p className="text-sm text-rose-300">{fieldErrors.email}</p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="password" className="text-white/80">Password</Label>
                <Input
                  id="password"
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={fieldErrors.password ? "true" : "false"}
                  className="border-white/10 bg-white/5 text-white placeholder:text-white/35"
                />
                <p className="text-xs text-white/45">
                  Use at least 8 characters with one letter and one number.
                </p>
                {fieldErrors.password ? (
                  <p className="text-sm text-rose-300">{fieldErrors.password}</p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="confirmPassword" className="text-white/80">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={fieldErrors.confirmPassword ? "true" : "false"}
                  className="border-white/10 bg-white/5 text-white placeholder:text-white/35"
                />
                {fieldErrors.confirmPassword ? (
                  <p className="text-sm text-rose-300">{fieldErrors.confirmPassword}</p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <label
                  htmlFor="acceptedTerms"
                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75"
                >
                  <input
                    id="acceptedTerms"
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(event) => setAcceptedTerms(event.target.checked)}
                    aria-invalid={fieldErrors.acceptedTerms ? "true" : "false"}
                    className="mt-1 size-4 rounded border-white/20 bg-transparent text-cyan focus:ring-cyan"
                  />
                  <span className="leading-6">
                    I agree to the{" "}
                    <Link href="/terms" className="font-medium text-white underline underline-offset-4">
                      Terms of Use
                    </Link>
                    ,{" "}
                    <Link href="/privacy" className="font-medium text-white underline underline-offset-4">
                      Privacy Policy
                    </Link>
                    , and{" "}
                    <Link href="/cookies" className="font-medium text-white underline underline-offset-4">
                      Cookie Policy
                    </Link>
                    .
                  </span>
                </label>
                <p className="text-xs text-white/45">
                  Enterprise customers can also review our{" "}
                  <Link href="/dpa" className="font-medium text-white underline underline-offset-4">
                    Data Processing Addendum
                  </Link>
                  .
                </p>
                {fieldErrors.acceptedTerms ? (
                  <p className="text-sm text-rose-300">{fieldErrors.acceptedTerms}</p>
                ) : null}
              </div>

              {message ? (
                <p role="alert" className="text-sm text-rose-300">
                  {message}
                </p>
              ) : null}

              <Button
                disabled={loading}
                aria-busy={loading}
                type="submit"
                className="w-full border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
              >
                {loading ? "Creating account..." : "Create account"}
              </Button>
            </form>

            <div className="space-y-2 text-sm text-white/60">
              <p>
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="font-medium text-white underline-offset-4 hover:underline"
                >
                  Login
                </Link>
              </p>
              <p>
                Need to review plan fit first?{" "}
                <Link
                  href="/pricing"
                  className="font-medium text-white underline-offset-4 hover:underline"
                >
                  View pricing
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
