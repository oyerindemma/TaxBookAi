"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Bot,
  ExternalLink,
  FileSearch,
  Loader2,
  MessageSquareText,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  AssistantAction,
  AssistantChatResponse,
  AssistantMessage,
  AssistantQuickInsight,
} from "@/lib/assistant-types";
import { cn } from "@/lib/utils";

type AssistantResult = Omit<AssistantChatResponse, "auditMetadata">;

type ChatMessage =
  | {
      id: string;
      role: "user";
      content: string;
    }
  | {
      id: string;
      role: "assistant";
      result: AssistantResult;
    };

type Props = {
  workspaceId: number;
  workspaceName: string;
  aiEnabled: boolean;
  quickInsights: AssistantQuickInsight[];
  suggestedPrompts: string[];
  initialQuestion?: string;
};

function buildHistory(messages: ChatMessage[]) {
  return messages.slice(-8).map((message) =>
    message.role === "user"
      ? {
          role: "user" as const,
          content: message.content,
        }
      : {
          role: "assistant" as const,
          content: message.result.answer,
        }
  ) satisfies AssistantMessage[];
}

function messageModeBadge(result: AssistantResult) {
  if (result.provider === "openai" && result.mode === "openai") {
    return "OpenAI synthesis";
  }

  if (result.provider === "openai") {
    return "Grounded fallback";
  }

  return "Rules only";
}

function actionVariant(intent: AssistantAction["intent"]) {
  if (intent === "confirm") return "default";
  if (intent === "review") return "outline";
  return "secondary";
}

function insightToneClasses(tone: AssistantQuickInsight["tone"]) {
  if (tone === "destructive") {
    return "border-destructive/20 bg-destructive/5";
  }
  if (tone === "outline") {
    return "border-border/80 bg-background";
  }
  if (tone === "secondary") {
    return "border-border/60 bg-muted/30";
  }
  return "border-primary/15 bg-primary/5";
}

export default function AssistantClient({
  workspaceId,
  workspaceName,
  aiEnabled,
  quickInsights,
  suggestedPrompts,
  initialQuestion = "",
}: Props) {
  const [question, setQuestion] = useState(initialQuestion);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQuestion(initialQuestion);
    setMessages([]);
    setError(null);
  }, [initialQuestion]);

  async function askAssistant(nextQuestion: string) {
    const trimmedQuestion = nextQuestion.trim();
    if (!trimmedQuestion) {
      setError("Enter a question.");
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmedQuestion,
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setQuestion("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId,
          message: trimmedQuestion,
          history: buildHistory(messages),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Unable to explain the workspace numbers");
        return;
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        result: {
          answer: data.answer,
          metrics: Array.isArray(data.metrics) ? data.metrics : [],
          citations: Array.isArray(data.citations) ? data.citations : [],
          actions: Array.isArray(data.actions) ? data.actions : [],
          warnings: Array.isArray(data.warnings) ? data.warnings : [],
          mode: data.mode === "openai" ? "openai" : "fallback",
          provider: data.provider === "openai" ? "openai" : "rules",
          aiEnabled: Boolean(data.aiEnabled),
          incompleteData: Boolean(data.incompleteData),
          suggestedPrompts: Array.isArray(data.suggestedPrompts) ? data.suggestedPrompts : [],
          status:
            data.status === "empty" || data.status === "partial" || data.status === "ready"
              ? data.status
              : "partial",
        },
      };

      setMessages([...nextMessages, assistantMessage]);
    } catch {
      setError("Network error running the workspace assistant");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await askAssistant(question);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
      <div className="space-y-6">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="border-b border-border/60">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Bot className="size-5 text-primary" />
              Assistant
            </CardTitle>
            <CardDescription>
              Ask grounded questions about <span className="font-medium text-foreground">{workspaceName}</span>. The assistant stays workspace-scoped, read-only by default, and cites the live records it used.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Workspace scoped</Badge>
              <Badge variant="outline">
                {aiEnabled ? "Generative answers enabled" : "Rules-only fallback"}
              </Badge>
              <Badge variant="outline">Grounded workspace data only</Badge>
            </div>

            <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="max-h-[58vh] space-y-4 overflow-y-auto pr-1">
                {messages.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/70 bg-background/80 p-6 text-sm text-muted-foreground">
                    Ask what tax is currently due, which transactions need review, why expenses changed, or what is still uncategorized. Suggested prompts stay on the right so you can jump in quickly.
                  </div>
                ) : null}

                {messages.map((message) =>
                  message.role === "user" ? (
                    <div key={message.id} className="flex justify-end">
                      <div className="max-w-[80%] rounded-2xl bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground shadow-sm">
                        {message.content}
                      </div>
                    </div>
                  ) : (
                    <div key={message.id} className="space-y-3">
                      <div className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">
                            <Sparkles className="size-3" />
                            {messageModeBadge(message.result)}
                          </Badge>
                          <Badge variant="outline">
                            <FileSearch className="size-3" />
                            {message.result.citations.length} citation
                            {message.result.citations.length === 1 ? "" : "s"}
                          </Badge>
                          {message.result.incompleteData ? (
                            <Badge variant="outline">Partial data</Badge>
                          ) : null}
                          <Badge variant="outline">
                            {message.result.status === "empty"
                              ? "Not enough data yet"
                              : message.result.status === "ready"
                                ? "Grounded"
                                : "Provisional"}
                          </Badge>
                        </div>

                        <div className="mt-3 text-sm leading-7 text-foreground">
                          {message.result.answer}
                        </div>

                        {message.result.warnings.length > 0 ? (
                          <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-900">
                            {message.result.warnings.map((warning) => (
                              <p key={warning}>{warning}</p>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      {message.result.metrics.length > 0 ? (
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {message.result.metrics.map((metric) => (
                            <Card key={`${message.id}-${metric.label}`} className="gap-3 border-border/60 py-4">
                              <CardHeader className="gap-1 px-4 pb-0">
                                <CardDescription>{metric.label}</CardDescription>
                                <CardTitle className="text-base">{metric.value}</CardTitle>
                              </CardHeader>
                              <CardContent className="px-4 text-xs leading-5 text-muted-foreground">
                                {metric.detail}
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : null}

                      {message.result.citations.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                            Cited records
                          </p>
                          <div className="grid gap-3 md:grid-cols-2">
                            {message.result.citations.map((source) => (
                              <Card key={`${message.id}-${source.id}`} className="gap-3 border-border/60 py-4">
                                <CardHeader className="gap-2 px-4 pb-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <CardTitle className="text-sm">{source.title}</CardTitle>
                                    {source.badge ? (
                                      <Badge variant="outline">{source.badge}</Badge>
                                    ) : null}
                                  </div>
                                  <CardDescription className="leading-5">
                                    {source.detail}
                                  </CardDescription>
                                </CardHeader>
                                {source.href ? (
                                  <CardContent className="px-4 pt-0">
                                    <Button asChild variant="ghost" size="sm" className="-ml-3">
                                      <Link href={source.href}>
                                        Open record
                                        <ExternalLink className="size-3.5" />
                                      </Link>
                                    </Button>
                                  </CardContent>
                                ) : null}
                              </Card>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {message.result.actions.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                            Follow-up actions
                          </p>
                          <div className="grid gap-3 md:grid-cols-2">
                            {message.result.actions.map((action) => (
                              <Card key={`${message.id}-${action.id}`} className="gap-3 border-border/60 py-4">
                                <CardHeader className="gap-2 px-4 pb-0">
                                  <div className="flex items-center gap-2">
                                    <CardTitle className="text-sm">{action.label}</CardTitle>
                                    <Badge variant="outline">{action.intent}</Badge>
                                  </div>
                                  <CardDescription className="leading-5">
                                    {action.description}
                                  </CardDescription>
                                </CardHeader>
                                <CardContent className="px-4 pt-0">
                                  <Button asChild variant={actionVariant(action.intent)} size="sm">
                                    <Link href={action.href}>
                                      {action.label}
                                      <ArrowRight className="size-3.5" />
                                    </Link>
                                  </Button>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {message.result.suggestedPrompts.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {message.result.suggestedPrompts.slice(0, 4).map((prompt) => (
                            <Button
                              key={`${message.id}-${prompt}`}
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={loading}
                              onClick={() => {
                                setQuestion(prompt);
                              }}
                            >
                              {prompt}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                )}

                {loading ? (
                  <div className="rounded-2xl border border-border/70 bg-background p-4 text-sm text-muted-foreground shadow-sm">
                    <div className="flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" />
                      Pulling workspace data and drafting an answer...
                    </div>
                  </div>
                ) : null}
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <label htmlFor="assistant-question" className="text-sm font-medium">
                  Ask the assistant
                </label>
                <textarea
                  id="assistant-question"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  rows={4}
                  placeholder="Ask what tax is due, which items need review, why expenses changed, or what is uncategorized..."
                  className="min-h-[132px] w-full rounded-xl border border-input bg-background px-4 py-3 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Thinking...
                      </>
                    ) : (
                      <>
                        <MessageSquareText className="size-4" />
                        Send question
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={loading}
                    onClick={() => {
                      setQuestion("");
                      setMessages([]);
                      setError(null);
                    }}
                  >
                    Clear chat
                  </Button>
                </div>
              </form>
            </div>

            {error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="border-border/70 bg-gradient-to-br from-primary/[0.06] via-background to-background shadow-sm">
          <CardHeader>
            <CardTitle>Suggested prompts</CardTitle>
            <CardDescription>
              Fast grounded questions for this workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {suggestedPrompts.map((prompt) => (
              <Button
                key={prompt}
                type="button"
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => setQuestion(prompt)}
              >
                {prompt}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Live signals</CardTitle>
            <CardDescription>
              Workspace insights stay grounded in live data even when generative synthesis is off.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {quickInsights.map((insight) => (
              <div
                key={insight.id}
                className={cn(
                  "rounded-2xl border p-4 transition-colors",
                  insightToneClasses(insight.tone)
                )}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">{insight.title}</h3>
                    <Badge variant="outline">Live data</Badge>
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
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Guardrails</CardTitle>
            <CardDescription>
              The assistant is designed to stay safe with live workspace data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>Answers stay scoped to the active workspace only.</p>
            <p>When data is incomplete, the assistant says so instead of guessing.</p>
            <p>Navigation and review actions are suggested, but no write action is executed from chat.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
