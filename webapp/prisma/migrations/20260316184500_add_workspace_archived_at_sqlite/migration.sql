ALTER TABLE "Workspace" ADD COLUMN "archivedAt" DATETIME;

CREATE INDEX "Workspace_archivedAt_idx" ON "Workspace"("archivedAt");
