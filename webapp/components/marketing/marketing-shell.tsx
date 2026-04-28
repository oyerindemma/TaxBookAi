import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicNavbar } from "@/components/marketing/public-navbar";

export const PUBLIC_SITE_BACKGROUND_CLASSNAME =
  "bg-primary bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.26),transparent_30%),radial-gradient(circle_at_82%_18%,rgba(34,211,238,0.18),transparent_22%),linear-gradient(180deg,#0b0f1a_0%,#0d1527_48%,#09131d_100%)]";

type MarketingShellProps = {
  children: ReactNode;
  backgroundClassName?: string;
};

export function MarketingShell({
  children,
  backgroundClassName = PUBLIC_SITE_BACKGROUND_CLASSNAME,
}: MarketingShellProps) {
  return (
    <div
      className={cn(
        "relative min-h-screen overflow-x-hidden bg-primary text-white selection:bg-cyan/30 selection:text-white",
        backgroundClassName
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.16),transparent_58%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-24 h-72 w-72 rounded-full bg-blue/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 top-28 h-80 w-80 rounded-full bg-cyan/15 blur-3xl"
      />
      <div className="relative z-10">
        <PublicNavbar />
        <main>{children}</main>
        <PublicFooter />
      </div>
    </div>
  );
}
