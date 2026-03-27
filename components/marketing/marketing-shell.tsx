import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicNavbar } from "@/components/marketing/public-navbar";

export const PUBLIC_SITE_BACKGROUND_CLASSNAME =
  "bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.22),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(34,211,238,0.14),transparent_20%),linear-gradient(180deg,#0b0f1a_0%,#0b1120_48%,#09131d_100%)]";

type MarketingShellProps = {
  children: ReactNode;
  backgroundClassName?: string;
};

export function MarketingShell({
  children,
  backgroundClassName = PUBLIC_SITE_BACKGROUND_CLASSNAME,
}: MarketingShellProps) {
  return (
    <div className={cn("min-h-screen bg-primary text-white", backgroundClassName)}>
      <PublicNavbar />
      <main>{children}</main>
      <PublicFooter />
    </div>
  );
}
