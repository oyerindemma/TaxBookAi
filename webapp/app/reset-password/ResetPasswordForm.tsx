"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
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

type ResetPasswordFormProps = {
  token: string;
};

type FieldErrors = Partial<Record<"token" | "password" | "confirmPassword", string>>;

export default function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setFieldErrors({});

    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data?.error ?? "We could not reset your password.");
        setFieldErrors((data?.fieldErrors ?? {}) as FieldErrors);
        return;
      }

      router.replace("/login?reset=success");
      router.refresh();
    } catch {
      setMessage("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-white/10 bg-white/5 text-white shadow-glow backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="text-white">Choose a new password</CardTitle>
        <CardDescription className="text-white/60">
          Use at least 8 characters with one letter and one number.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="password" className="text-white/80">New password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={fieldErrors.password ? "true" : "false"}
              className="border-white/10 bg-white/5 text-white placeholder:text-white/35"
            />
            {fieldErrors.password ? (
              <p className="text-sm text-rose-300">{fieldErrors.password}</p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="confirmPassword" className="text-white/80">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              aria-invalid={fieldErrors.confirmPassword ? "true" : "false"}
              className="border-white/10 bg-white/5 text-white placeholder:text-white/35"
            />
            {fieldErrors.confirmPassword ? (
              <p className="text-sm text-rose-300">{fieldErrors.confirmPassword}</p>
            ) : null}
          </div>

          {message ? <p className="text-sm text-rose-300">{message}</p> : null}

          <Button
            disabled={loading}
            type="submit"
            className="w-full border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
          >
            {loading ? "Resetting password..." : "Reset password"}
          </Button>
        </form>

        <p className="text-sm text-white/60">
          Need a new link?{" "}
          <Link
            href="/forgot-password"
            className="font-medium text-white underline-offset-4 hover:underline"
          >
            Request another reset email
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
