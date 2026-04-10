import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import {
  adminEmail,
  adminEmailHref,
  billingEmail,
  billingEmailHref,
  phoneHref,
  phoneNumber,
  supportEmail,
  supportEmailHref,
} from "@/lib/config/contact";

type LegalDocumentSection = {
  title: string;
  paragraphs: readonly string[];
};

type LegalDocumentPageProps = {
  badge: string;
  title: string;
  description: string;
  sections: readonly LegalDocumentSection[];
};

function ContactCard() {
  return (
    <Card className="border-white/10 bg-white/5 text-white shadow-glow backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="text-white">Contact</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm text-white/72 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="font-medium text-white">Technical Support</p>
          <a href={supportEmailHref} className="break-all transition hover:text-white">
            {supportEmail}
          </a>
        </div>
        <div className="space-y-1">
          <p className="font-medium text-white">Billing Support</p>
          <a href={billingEmailHref} className="break-all transition hover:text-white">
            {billingEmail}
          </a>
        </div>
        <div className="space-y-1">
          <p className="font-medium text-white">Administration</p>
          <a href={adminEmailHref} className="break-all transition hover:text-white">
            {adminEmail}
          </a>
        </div>
        <div className="space-y-1">
          <p className="font-medium text-white">Phone</p>
          <a href={phoneHref} className="transition hover:text-white">
            {phoneNumber}
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

export function LegalDocumentPage({
  badge,
  title,
  description,
  sections,
}: LegalDocumentPageProps) {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <div className="space-y-8">
          <div className="space-y-4">
            <Badge className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-white hover:bg-white/5">
              {badge}
            </Badge>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                {title}
              </h1>
              <p className="max-w-3xl text-base leading-7 text-white/65 sm:text-lg">
                {description}
              </p>
            </div>
          </div>

          <div className="grid gap-4">
            {sections.map((section) => (
              <Card
                key={section.title}
                className="border-white/10 bg-white/5 text-white shadow-glow backdrop-blur-xl"
              >
                <CardHeader>
                  <CardTitle className="text-xl text-white">{section.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm leading-7 text-white/72 sm:text-base">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>

          <ContactCard />

          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              className="border-0 bg-gradient-primary text-white shadow-glow transition hover:opacity-90"
            >
              <Link href="/">Back to homepage</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/contact">Contact TaxBook AI</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
