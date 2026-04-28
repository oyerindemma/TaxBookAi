import Link from "next/link";
import { ArrowRight, Bot, LockKeyhole, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ExplainMyNumbersQuickInsight } from "@/lib/explain-my-numbers-types";

type Props = {
  workspaceName: string;
  isEnabled: boolean;
  aiEnabled: boolean;
  quickInsights: ExplainMyNumbersQuickInsight[];
  suggestedPrompts: string[];
  lockedMessage?: string | null;
  unavailableMessage?: string | null;
};

function buildPromptHref(prompt: string) {
  return `/dashboard/assistant?prompt=${encodeURIComponent(prompt)}`;
}

function insightToneClasses(tone: ExplainMyNumbersQuickInsight["tone"]) {
  if (tone === "destructive") {
    return "border-rose-200 bg-rose-50";
  }

  if (tone === "outline") {
    return "border-cyan/15 bg-white";
  }

  if (tone === "secondary") {
    return "border-cyan/10 bg-slate-50";
  }

  return "border-cyan/15 bg-primary/5";
}

export default function ExplainMyNumbersAssistantPanel({
  workspaceName,
  isEnabled,
  aiEnabled,
  quickInsights,
  suggestedPrompts,
  lockedMessage,
  unavailableMessage,
}: Props) {
  if (unavailableMessage) {
    return (
      <Card className="rounded-2xl border border-cyan/15 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Bot className="size-5 text-primary" />
            Explain my numbers
          </CardTitle>
          <CardDescription>{unavailableMessage}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/dashboard/assistant">Open assistant</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!isEnabled) {
    return (
      <Card className="rounded-2xl border border-cyan/15 bg-white shadow-sm">
        <CardHeader className="gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <Bot className="size-5 text-primary" />
                Explain my numbers
              </CardTitle>
              <CardDescription>
                Ask grounded questions about the active workspace once AI assistant access is enabled.
              </CardDescription>
            </div>
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <LockKeyhole className="size-5" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-cyan/10 bg-slate-50 px-4 py-3 text-sm leading-6 text-muted-foreground">
            {lockedMessage ?? "This assistant is not available on the current workspace plan."}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/dashboard/assistant">
                View assistant access
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/billing">Open billing</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl border border-cyan/15 bg-white shadow-sm">
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Bot className="size-5 text-primary" />
              Explain my numbers
            </CardTitle>
            <CardDescription>
              Grounded answers for {workspaceName} using live workspace numbers only.
            </CardDescription>
          </div>
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Workspace scoped</Badge>
          <Badge variant="outline">{aiEnabled ? "Generative mode" : "Rules-only mode"}</Badge>
        </div>

        <div className="space-y-3">
          {quickInsights.slice(0, 3).map((insight) => (
            <div
              key={insight.id}
              className={`rounded-2xl border p-4 ${insightToneClasses(insight.tone)}`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-950">{insight.title}</div>
                  <Badge variant="outline">Live</Badge>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">{insight.summary}</p>
                <Button asChild variant="ghost" size="sm" className="-ml-3">
                  <Link href={insight.href}>
                    {insight.ctaLabel}
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Shortcut questions
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestedPrompts.slice(0, 4).map((prompt) => (
              <Button key={prompt} asChild variant="outline" size="sm">
                <Link href={buildPromptHref(prompt)}>{prompt}</Link>
              </Button>
            ))}
          </div>
        </div>

        <Button asChild className="w-full">
          <Link href="/dashboard/assistant">
            Open full assistant
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
