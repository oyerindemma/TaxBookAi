import "server-only";

import { Job, Queue, Worker, type RedisOptions } from "bullmq";
import type {
  ComplianceExportPayload,
  ComplianceExportScope,
} from "@/lib/compliance-export-service";

export const COMPLIANCE_EXPORT_QUEUE_NAME = "compliance-export";

export type ComplianceExportJobData = {
  userId: number;
  scope: ComplianceExportScope;
  workspaceId: number | null;
  requestedAt: string;
};

export type ComplianceExportJobResult = ComplianceExportPayload;

let complianceExportQueue: Queue<ComplianceExportJobData, ComplianceExportJobResult> | null = null;
const DEFAULT_WORKER_CONCURRENCY = 2;
const MAX_WORKER_CONCURRENCY = 10;

function readRedisUrl() {
  return (
    process.env.REDIS_URL?.trim() ||
    process.env.BULLMQ_REDIS_URL?.trim() ||
    process.env.UPSTASH_REDIS_URL?.trim() ||
    ""
  );
}

export function hasComplianceExportQueueConfig() {
  return Boolean(readRedisUrl());
}

export function getBullMqRedisConnection(): RedisOptions {
  const redisUrl = readRedisUrl();
  if (!redisUrl) {
    throw new Error("REDIS_URL or BULLMQ_REDIS_URL is required for async compliance exports.");
  }

  const url = new URL(redisUrl);
  const db = url.pathname.replace("/", "");
  const parsedDb = db ? Number(db) : undefined;
  if (parsedDb !== undefined && (!Number.isInteger(parsedDb) || parsedDb < 0)) {
    throw new Error("Redis URL database index must be a non-negative integer.");
  }

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : url.protocol === "rediss:" ? 6380 : 6379,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: parsedDb,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  };
}

export function resolveComplianceExportWorkerConcurrency(raw = process.env.COMPLIANCE_EXPORT_WORKER_CONCURRENCY) {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_WORKER_CONCURRENCY;
  }
  return Math.min(parsed, MAX_WORKER_CONCURRENCY);
}

export function getComplianceExportQueue() {
  if (!complianceExportQueue) {
    complianceExportQueue = new Queue<ComplianceExportJobData, ComplianceExportJobResult>(
      COMPLIANCE_EXPORT_QUEUE_NAME,
      {
        connection: getBullMqRedisConnection(),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5_000,
          },
          removeOnComplete: {
            age: 60 * 60 * 24,
            count: 500,
          },
          removeOnFail: {
            age: 60 * 60 * 24 * 7,
            count: 1_000,
          },
        },
      }
    );
  }

  return complianceExportQueue;
}

export async function enqueueComplianceExportJob(input: Omit<ComplianceExportJobData, "requestedAt">) {
  const queue = getComplianceExportQueue();
  const job = await queue.add("build-export", {
    ...input,
    requestedAt: new Date().toISOString(),
  }, {
    jobId: [
      input.userId,
      input.scope,
      input.workspaceId ?? "account",
      Date.now(),
    ].join(":"),
  });

  return job;
}

export async function getComplianceExportJob(jobId: string) {
  return Job.fromId<ComplianceExportJobData, ComplianceExportJobResult>(
    getComplianceExportQueue(),
    jobId
  );
}

export function createComplianceExportWorker(
  processor: (job: Job<ComplianceExportJobData, ComplianceExportJobResult>) => Promise<ComplianceExportJobResult>
) {
  return new Worker<ComplianceExportJobData, ComplianceExportJobResult>(
    COMPLIANCE_EXPORT_QUEUE_NAME,
    processor,
    {
      connection: getBullMqRedisConnection(),
      concurrency: resolveComplianceExportWorkerConcurrency(),
      lockDuration: 120_000,
      stalledInterval: 30_000,
      maxStalledCount: 2,
    }
  );
}
