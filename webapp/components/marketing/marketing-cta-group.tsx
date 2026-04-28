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
    "border border-cyan/25 bg-gradient-primary text-white shadow-glow transition hover:-translate-y-0.5 hover:opacity-95";
  const defaultOutlineClassName =
    "border border-blue/20 bg-primary/40 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-cyan/30 hover:bg-primary/55 hover:text-white";
  const defaultGhostClassName =
    "text-white/72 hover:bg-primary/40 hover:text-white";
  const inverseOutlineClassName =
    "border border-white/20 bg-white/5 text-slate-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:bg-white/10 hover:text-slate-50";
  const inverseGhostClassName =
    "text-slate-50 hover:bg-primary/40 hover:text-slate-50";

  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      <Button
        asChild
        size={size}
        className={
          tone === "inverse"
            ? "border border-white/30 bg-white text-slate-950 shadow-glow hover:bg-white/90"
            : primaryClassName
        }
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
