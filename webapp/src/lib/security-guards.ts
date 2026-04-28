import crypto from "node:crypto";
import type { DeploymentStage } from "@/lib/env";

const SENSITIVE_METADATA_KEY_PATTERN =
  /(?:password|secret|token|api[_-]?key|authorization|cookie|session|credential|private[_-]?key)/i;

function redactSensitiveMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveMetadata);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      SENSITIVE_METADATA_KEY_PATTERN.test(key)
        ? "[REDACTED]"
        : redactSensitiveMetadata(entry),
    ])
  );
}

export function serializeAuditMetadata(metadata: Record<string, unknown> | string | null | undefined) {
  if (metadata && typeof metadata === "object") {
    return JSON.stringify(redactSensitiveMetadata(metadata));
  }

  return metadata ?? null;
}

export function isProductionDemoRouteAllowed(input: {
  deploymentStage: DeploymentStage;
  demoModeEnabled: boolean;
  accessSecretConfigured: boolean;
}) {
  if (input.deploymentStage !== "production") return true;
  return input.demoModeEnabled && input.accessSecretConfigured;
}

export function secureCompareText(candidate: string | null | undefined, expected: string) {
  const candidateBuffer = Buffer.from(candidate ?? "");
  const expectedBuffer = Buffer.from(expected);
  if (candidateBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
}
