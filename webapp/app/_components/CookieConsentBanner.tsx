"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  COOKIE_CONSENT_COOKIE_NAME,
  COOKIE_CONSENT_MAX_AGE_SECONDS,
  COOKIE_CONSENT_STORAGE_KEY,
  type CookieConsentStatus,
} from "@/lib/config/compliance";

type ConsentState = CookieConsentStatus | "unset" | "loading";

function persistConsent(choice: CookieConsentStatus) {
  window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, choice);

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_CONSENT_COOKIE_NAME}=${choice}; Path=/; Max-Age=${COOKIE_CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

export default function CookieConsentBanner() {
  const [consent, setConsent] = useState<ConsentState>("loading");

  useEffect(() => {
    const stored = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    const nextConsent = stored === "accepted" || stored === "rejected" ? stored : "unset";

    queueMicrotask(() => {
      setConsent(nextConsent);
    });
  }, []);

  if (consent !== "unset") {
    return null;
  }

  function handleChoice(choice: CookieConsentStatus) {
    persistConsent(choice);
    setConsent(choice);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] px-4 pb-4 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 rounded-3xl border bg-background/95 p-4 text-foreground shadow-2xl backdrop-blur supports-[backdrop-filter]:bg-background/88 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold">Cookie preferences</p>
          <p className="max-w-3xl text-sm text-muted-foreground">
            TaxBook AI uses cookies for sign-in continuity, security, and product reliability.
            Choose whether to allow non-essential cookie usage, and review the{" "}
            <Link href="/cookies" className="font-medium text-foreground underline underline-offset-4">
              Cookie Policy
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => handleChoice("rejected")}>
            Reject non-essential
          </Button>
          <Button onClick={() => handleChoice("accepted")}>Accept cookies</Button>
        </div>
      </div>
    </div>
  );
}
