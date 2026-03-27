"use client";

import { Button } from "@/components/ui/button";

type Props = {
  label?: string;
  className?: string;
};

export function InvoicePrintButton({
  label = "Print / PDF",
  className,
}: Props) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        if (typeof window !== "undefined") {
          window.print();
        }
      }}
      aria-label={label}
      className={className}
    >
      {label}
    </Button>
  );
}
