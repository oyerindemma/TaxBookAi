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

type FieldErrors = Partial<Record<"email" | "password", string>>;
type LoginResponse = {
  error?: string;
  details?: string;
  fieldErrors?: FieldErrors;
};

async function parseLoginResponse(res: Response) {
  const contentType = res.headers.get("content-type") ?? "";

  if (contentType.toLowerCase().includes("application/json")) {
    try {
      return {
        data: (await res.json()) as LoginResponse,
        fallbackText: null,
      };
    } catch {
      return {
        data: null,
        fallbackText: null,
      };
    }
  }

  try {
    const text = (await res.text()).trim();
    return {
      data: null,
      fallbackText: text || null,
    };
  } catch {
    return {
      data: null,
      fallbackText: null,
    };
  }
}

function getSafeNextPath(raw: string | null) {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  return raw;
}

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = getSafeNextPath(searchParams.get("next"));
  const resetSuccess = searchParams.get("reset") === "success";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setMessage(null);
    setFieldErrors({});

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const { data, fallbackText } = await parseLoginResponse(res);

      if (!res.ok) {
        setMessage(
          data?.details?.trim() ||
            data?.error?.trim() ||
            fallbackText ||
            `Login failed with status ${res.status}.`
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
            Login
          </Badge>
          <h1 className="text-5xl font-semibold tracking-tight text-balance text-white">
            Return to your TaxBook AI workspace.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-white/65">
            Pick up bookkeeping review, invoices, bank reconciliation, tax visibility, and reports
            right where your team left them.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="border-white/10 bg-white/5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.2)] backdrop-blur-xl">
              <CardHeader className="pb-3">
                <CardDescription className="text-white/55">Workspace context</CardDescription>
                <CardTitle className="text-lg text-white">Role-aware access</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-white/10 bg-white/5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.2)] backdrop-blur-xl">
              <CardHeader className="pb-3">
                <CardDescription className="text-white/55">Operational continuity</CardDescription>
                <CardTitle className="text-lg text-white">Audit-friendly history</CardTitle>
              </CardHeader>
            </Card>
          </div>
        </div>

        <Card className="border-white/10 bg-white/5 text-white shadow-glow backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white">Sign in</CardTitle>
            <CardDescription className="text-white/60">
              Use the email and password associated with your TaxBook AI account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {resetSuccess ? (
              <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                Your password has been reset. Log in with your new password.
              </div>
            ) : null}

            <form onSubmit={onSubmit} className="grid gap-4">
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
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="password" className="text-white/80">Password</Label>
                  <Link
                    href="/forgot-password"
                    className="text-sm font-medium text-white/72 underline-offset-4 hover:text-white hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={fieldErrors.password ? "true" : "false"}
                  className="border-white/10 bg-white/5 text-white placeholder:text-white/35"
                />
                {fieldErrors.password ? (
                  <p className="text-sm text-rose-300">{fieldErrors.password}</p>
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
                {loading ? "Signing in..." : "Login"}
              </Button>
            </form>

            <div className="space-y-2 text-sm text-white/60">
              <p>
                New to TaxBook?{" "}
                <Link
                  href="/signup"
                  className="font-medium text-white underline-offset-4 hover:underline"
                >
                  Start Free
                </Link>
              </p>
              <p>
                Need to compare plans first?{" "}
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
