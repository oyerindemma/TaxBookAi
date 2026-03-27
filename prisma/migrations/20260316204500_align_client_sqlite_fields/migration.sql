PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Client" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "taxId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Client_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Client" (
    "id",
    "workspaceId",
    "name",
    "companyName",
    "email",
    "phone",
    "address",
    "taxId",
    "notes",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "workspaceId",
    "name",
    NULL,
    "email",
    "phone",
    "address",
    NULL,
    NULL,
    "createdAt",
    "createdAt"
FROM "Client";

DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";

CREATE INDEX "Client_workspaceId_name_idx" ON "Client"("workspaceId", "name");
CREATE INDEX "Client_workspaceId_companyName_idx" ON "Client"("workspaceId", "companyName");
CREATE INDEX "Client_workspaceId_email_idx" ON "Client"("workspaceId", "email");
CREATE INDEX "Client_workspaceId_taxId_idx" ON "Client"("workspaceId", "taxId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
