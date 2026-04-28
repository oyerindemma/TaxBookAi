"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type TryDemoButtonProps = {
  className?: string;
};

export function TryDemoButton({ className }: TryDemoButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/system/demo/create?withIssues=true", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });

        const data = (await response.json()) as {
          error?: string;
          redirectTo?: string;
        };

        if (!response.ok) {
          setError(data.error ?? "Unable to start the demo right now.");
          return;
        }

        router.push(data.redirectTo ?? "/dashboard");
        router.refresh();
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to start the demo right now."
        );
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="lg"
        onClick={handleClick}
        disabled={isPending}
        className={className}
      >
        <PlayCircle className="size-4" />
        {isPending ? "Preparing demo..." : "Try Demo"}
      </Button>
      {error ? <p className="text-sm text-rose-200">{error}</p> : null}
    </div>
  );
}
