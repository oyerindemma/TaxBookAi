import { buildComplianceExportPayload } from "@/lib/compliance-export-service";
import { createComplianceExportWorker } from "@/lib/jobs/compliance-export-queue";
import { logError, logInfo } from "@/lib/logger";

const worker = createComplianceExportWorker(async (job) => {
  await job.updateProgress({
    stage: "started",
    percent: 5,
    startedAt: new Date().toISOString(),
  });

  logInfo("worker", "building compliance export", {
    jobId: job.id,
    userId: job.data.userId,
    scope: job.data.scope,
    workspaceId: job.data.workspaceId,
  });

  const payload = await buildComplianceExportPayload({
    userId: job.data.userId,
    scope: job.data.scope,
    workspaceId: job.data.workspaceId,
    processingMode: "async",
  });

  await job.updateProgress({
    stage: "completed",
    percent: 100,
    completedAt: payload.completedAt,
  });

  return payload;
});

worker.on("completed", (job) => {
  logInfo("worker", "compliance export completed", {
    jobId: job.id,
    userId: job.data.userId,
    scope: job.data.scope,
  });
});

worker.on("failed", (job, error) => {
  logError("worker", "compliance export failed", error, {
    jobId: job?.id,
    userId: job?.data.userId,
    scope: job?.data.scope,
  });
});

worker.on("error", (error) => {
  logError("worker", "compliance export worker runtime error", error);
});

async function shutdown(signal: NodeJS.Signals) {
  logInfo("worker", "shutting down compliance export worker", { signal });
  await worker.close();
  process.exit(0);
}

process.on("unhandledRejection", (error) => {
  logError("worker", "unhandled rejection in compliance export worker", error);
});

process.on("uncaughtException", (error) => {
  logError("worker", "uncaught exception in compliance export worker", error);
  process.exit(1);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

logInfo("worker", "compliance export worker started");
