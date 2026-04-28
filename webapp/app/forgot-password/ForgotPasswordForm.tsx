"use client";

import Link from "next/link";
import { useState } from "react";
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

type ForgotPasswordResponse = {
  error?: string;
  message?: string;
  debugResetUrl?: string;
  fieldErrors?: {
    email?: string;
  };
};

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [debugResetUrl, setDebugResetUrl] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setDebugResetUrl(null);
    setFieldError(null);

    try {
      const res = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = (await res.json()) as ForgotPasswordResponse;

      if (!res.ok) {
        setMessage(data.error ?? "Password reset is unavailable right now.");
        setFieldError(data.fieldErrors?.email ?? null);
        return;
      }

      setMessage(data.message ?? "Check your email for the reset link.");
      setDebugResetUrl(data.debugResetUrl ?? null);
    } catch {
      setMessage("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,0.8fr)] lg:items-center">
        <div className="space-y-5">
          <Badge className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-white hover:bg-white/5">
            Password Reset
          </Badge>
          <h1 className="text-5xl font-semibold tracking-tight text-balance text-white">
            Reset access without losing your workspace.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-white/65">
            Enter the email address linked to your account. If it exists, TaxBook will send a
            reset link that lets you choose a new password securely.
          </p>
        </div>

        <Card className="border-white/10 bg-white/5 text-white shadow-glow backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white">Forgot your password?</CardTitle>
            <CardDescription className="text-white/60">
              We will email you a secure link to reset it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form onSubmit={onSubmit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email" className="text-white/80">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  autoComplete="email"
                  aria-invalid={fieldError ? "true" : "false"}
                  className="border-white/10 bg-white/5 text-white placeholder:text-white/35"
                />
                {fieldError ? <p className="text-sm text-rose-300">{fieldError}</p> : null}
              </div>

              {message ? (
                <p
                  className={
                    debugResetUrl
                      ? "text-sm text-emerald-100"
                      : "text-sm text-white/60"
                  }
                >
                  {message}
                </p>
              ) : null}

              {debugResetUrl ? (
                <div className="rounded-xl border border-dashed border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  Local preview link:{" "}
                  <Link
                    href={debugResetUrl}
                    className="font-medium underline underline-offset-4"
                  >
                    Open reset password
                  </Link>
                </div>
              ) : null}

              <Button
                disabled={loading}
                type="submit"
                className="w-full border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
              >
                {loading ? "Sending reset link..." : "Send reset link"}
              </Button>
            </form>

            <p className="text-sm text-white/60">
              Remembered it?{" "}
              <Link
                href="/login"
                className="font-medium text-white underline-offset-4 hover:underline"
              >
                Back to login
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
