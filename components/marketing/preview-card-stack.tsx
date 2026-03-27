import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PREVIEW_CARDS } from "@/components/marketing/site-content";

type PreviewCardStackProps = {
  compact?: boolean;
};

export function PreviewCardStack({ compact = false }: PreviewCardStackProps) {
  return (
    <div className="grid gap-4">
      {PREVIEW_CARDS.map((card, index) => (
        <Card
          key={card.title}
          className={[
            "overflow-hidden border-white/10 bg-white/5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.3)] backdrop-blur-xl",
            index === 1 ? "lg:translate-x-8" : "",
            index === 2 ? "lg:-translate-x-6" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className={`bg-gradient-to-br from-white/[0.04] via-transparent to-cyan/10`}>
            <CardHeader className={compact ? "space-y-3 pb-3" : "space-y-4"}>
              <div className="flex items-center justify-between gap-3">
                <Badge className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white hover:bg-white/5">
                  {card.eyebrow}
                </Badge>
                <div className="text-xs uppercase tracking-[0.24em] text-white/45">
                  Live workspace
                </div>
              </div>
              <div className="space-y-2">
                <CardTitle className={`${compact ? "text-xl" : "text-2xl"} text-white`}>
                  {card.title}
                </CardTitle>
                <CardDescription className="max-w-xl leading-6 text-white/60">
                  {card.description}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 pb-6">
              {card.rows.map((row) => (
                <div
                  key={`${card.title}-${row.label}`}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <span className="text-sm text-white/55">{row.label}</span>
                  <span className="text-sm font-semibold text-white">{row.value}</span>
                </div>
              ))}
            </CardContent>
          </div>
        </Card>
      ))}
    </div>
  );
}
