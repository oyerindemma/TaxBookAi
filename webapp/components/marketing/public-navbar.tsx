"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MARKETING_NAME,
  MARKETING_NAV_ITEMS,
  MARKETING_TAGLINE,
} from "@/components/marketing/site-content";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PublicNavbar() {
  const pathname = usePathname() ?? "/";

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-primary/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-primary text-sm font-semibold text-white shadow-glow">
            TB
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-semibold tracking-tight text-white">
              {MARKETING_NAME}
            </p>
            <p className="text-xs text-white/60">{MARKETING_TAGLINE}</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {MARKETING_NAV_ITEMS.map((item) => (
            <Button
              key={item.href}
              asChild
              variant="ghost"
              className={cn(
                "text-sm text-white/72 hover:bg-white/10 hover:text-white",
                isActivePath(pathname, item.href) && "bg-white/10 text-white shadow-glow"
              )}
            >
              <Link href={item.href}>{item.label}</Link>
            </Button>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Button
            asChild
            variant="outline"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
          >
            <Link href="/contact">Book Demo</Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            className="text-white/72 hover:bg-white/10 hover:text-white"
          >
            <Link href="/login">Login</Link>
          </Button>
          <Button
            asChild
            className="border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
          >
            <Link href="/signup">Start Free Trial</Link>
          </Button>
        </div>

        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="Open navigation"
              className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white lg:hidden"
            >
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[320px] border-white/10 bg-primary text-white">
            <SheetHeader className="text-left">
              <SheetTitle className="text-white">Navigate {MARKETING_NAME}</SheetTitle>
              <SheetDescription className="text-white/60">
                Explore the product, pricing, and launch contact options.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-8 space-y-2">
              {MARKETING_NAV_ITEMS.map((item) => (
                <Button
                  key={item.href}
                  asChild
                  variant={isActivePath(pathname, item.href) ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start text-white hover:bg-white/10 hover:text-white",
                    isActivePath(pathname, item.href) && "bg-white/10 text-white shadow-glow"
                  )}
                >
                  <Link href={item.href}>{item.label}</Link>
                </Button>
              ))}
            </div>
            <div className="mt-8 grid gap-3">
              <Button
                asChild
                variant="ghost"
                className="w-full justify-start text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/login">Login</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/contact">Book Demo</Link>
              </Button>
              <Button
                asChild
                className="w-full border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
              >
                <Link href="/signup">Start Free Trial</Link>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
