import "server-only";

import { extractOutputText } from "@/lib/bookkeeping-ai";
import { getOpenAiServerConfig, hasOpenAiServerConfig } from "@/lib/env";
import { buildAssistantSystemPrompt, buildAssistantUserPrompt } from "@/lib/assistant-prompt";
import type {
  AssistantAnswerDraft,
  AssistantMessage,
  AssistantWorkspaceContext,
} from "@/lib/assistant-types";

export type AssistantProviderKey = "openai" | "rules";

export type AssistantProviderResult = {
  answer: string;
  provider: AssistantProviderKey;
  mode: "openai" | "fallback";
  incompleteData: boolean;
  warning: string | null;
};

type AssistantProviderInput = {
  workspaceContext: AssistantWorkspaceContext;
  draft: AssistantAnswerDraft;
  message: string;
  history: AssistantMessage[];
};

type AssistantProvider = {
  key: AssistantProviderKey;
  available: boolean;
  synthesize?: (input: AssistantProviderInput) => Promise<AssistantProviderResult>;
};

function buildFallbackProviderResult(
  input: AssistantProviderInput,
  warning: string | null
): AssistantProviderResult {
  return {
    answer: input.draft.answer,
    provider: "rules",
    mode: "fallback",
    incompleteData: input.draft.incompleteData,
    warning,
  };
}

export function getAssistantProvider(): AssistantProvider {
  if (!hasOpenAiServerConfig()) {
    return {
      key: "rules",
      available: false,
    };
  }

  return {
    key: "openai",
    available: true,
    async synthesize(input) {
      const { apiKey, assistantModel } = getOpenAiServerConfig();
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: assistantModel,
          temperature: 0.2,
          input: [
            {
              role: "system",
              content: buildAssistantSystemPrompt(),
            },
            {
              role: "user",
              content: buildAssistantUserPrompt(input),
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "taxbook_workspace_assistant_answer",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  answer: {
                    type: "string",
                  },
                  incompleteData: {
                    type: "boolean",
                  },
                },
                required: ["answer", "incompleteData"],
              },
            },
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "OpenAI assistant request failed");
      }

      const outputText = extractOutputText(data);
      if (!outputText) {
        throw new Error("OpenAI assistant response was empty");
      }

      const parsed = JSON.parse(outputText) as {
        answer: string;
        incompleteData: boolean;
      };

      return {
        answer: parsed.answer.trim() || input.draft.answer,
        provider: "openai",
        mode: "openai",
        incompleteData: parsed.incompleteData || input.draft.incompleteData,
        warning: null,
      };
    },
  };
}

export async function generateAssistantAnswer(
  input: AssistantProviderInput
): Promise<AssistantProviderResult> {
  const provider = getAssistantProvider();
  if (!provider.available || !provider.synthesize) {
    return buildFallbackProviderResult(
      input,
      "OpenAI is not configured in this environment, so the assistant is running in rules-only mode."
    );
  }

  try {
    return await provider.synthesize(input);
  } catch {
    return buildFallbackProviderResult(
      input,
      "Generative synthesis was unavailable, so this answer used the grounded rules-based assistant."
    );
  }
}
