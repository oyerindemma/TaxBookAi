-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExpenseCategory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TaxRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "workspaceId" INTEGER,
    "invoiceId" INTEGER,
    "categoryId" INTEGER,
    "kind" TEXT NOT NULL,
    "amountKobo" INTEGER NOT NULL,
    "taxRate" REAL NOT NULL DEFAULT 0,
    "computedTax" INTEGER NOT NULL DEFAULT 0,
    "netAmount" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "occurredOn" DATETIME NOT NULL,
    "description" TEXT,
    "source" TEXT,
    "vendorName" TEXT,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaxRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaxRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaxRecord_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TaxRecord_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TaxRecord" ("amountKobo", "computedTax", "createdAt", "currency", "description", "id", "invoiceId", "kind", "netAmount", "occurredOn", "source", "taxRate", "updatedAt", "userId", "workspaceId") SELECT "amountKobo", "computedTax", "createdAt", "currency", "description", "id", "invoiceId", "kind", "netAmount", "occurredOn", "source", "taxRate", "updatedAt", "userId", "workspaceId" FROM "TaxRecord";
DROP TABLE "TaxRecord";
ALTER TABLE "new_TaxRecord" RENAME TO "TaxRecord";
CREATE INDEX "TaxRecord_userId_occurredOn_idx" ON "TaxRecord"("userId", "occurredOn");
CREATE INDEX "TaxRecord_workspaceId_occurredOn_idx" ON "TaxRecord"("workspaceId", "occurredOn");
CREATE INDEX "TaxRecord_categoryId_idx" ON "TaxRecord"("categoryId");
CREATE UNIQUE INDEX "TaxRecord_invoiceId_key" ON "TaxRecord"("invoiceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ExpenseCategory_workspaceId_name_idx" ON "ExpenseCategory"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_workspaceId_name_key" ON "ExpenseCategory"("workspaceId", "name");
