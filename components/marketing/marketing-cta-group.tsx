import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MarketingCTAGroupProps = {
  className?: string;
  compact?: boolean;
  showContactSales?: boolean;
  showLogin?: boolean;
  showViewPricing?: boolean;
  tone?: "default" | "inverse";
};

export function MarketingCTAGroup({
  className,
  compact = false,
  showContactSales = true,
  showLogin = true,
  showViewPricing = true,
  tone = "default",
}: MarketingCTAGroupProps) {
  const size = compact ? "default" : "lg";
  const primaryClassName =
    "border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90";
  const defaultOutlineClassName =
    "border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white";
  const defaultGhostClassName =
    "text-white/72 hover:bg-white/10 hover:text-white";
  const inverseOutlineClassName =
    "border-white/20 bg-transparent text-slate-50 hover:bg-white/10 hover:text-slate-50";
  const inverseGhostClassName =
    "text-slate-50 hover:bg-white/10 hover:text-slate-50";

  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      <Button
        asChild
        size={size}
        className={tone === "inverse" ? "bg-white text-slate-950 hover:bg-white/90" : primaryClassName}
      >
        <Link href="/signup">
          Start Free Trial
          <ArrowRight className="size-4" />
        </Link>
      </Button>

      {showViewPricing && (
        <Button
          asChild
          size={size}
          variant="outline"
          className={tone === "inverse" ? inverseOutlineClassName : defaultOutlineClassName}
        >
          <Link href="/pricing">View Pricing</Link>
        </Button>
      )}

      {showContactSales && (
        <Button
          asChild
          size={size}
          variant="outline"
          className={tone === "inverse" ? inverseOutlineClassName : defaultOutlineClassName}
        >
          <Link href="/contact">Book Demo</Link>
        </Button>
      )}

      {showLogin && (
        <Button
          asChild
          size={size}
          variant="ghost"
          className={tone === "inverse" ? inverseGhostClassName : defaultGhostClassName}
        >
          <Link href="/login">Login</Link>
        </Button>
      )}
    </div>
  );
}
