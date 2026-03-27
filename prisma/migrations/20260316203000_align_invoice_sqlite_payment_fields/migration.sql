PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Invoice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "recurringInvoiceId" INTEGER,
    "invoiceNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "paymentReference" TEXT,
    "paymentUrl" TEXT,
    "paidAt" DATETIME,
    "issueDate" DATETIME NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "taxAmount" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_recurringInvoiceId_fkey" FOREIGN KEY ("recurringInvoiceId") REFERENCES "RecurringInvoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Invoice" (
    "id",
    "workspaceId",
    "clientId",
    "recurringInvoiceId",
    "invoiceNumber",
    "status",
    "paymentReference",
    "paymentUrl",
    "paidAt",
    "issueDate",
    "dueDate",
    "subtotal",
    "taxAmount",
    "totalAmount",
    "notes",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "workspaceId",
    "clientId",
    NULL,
    "invoiceNumber",
    "status",
    NULL,
    NULL,
    NULL,
    "issueDate",
    "dueDate",
    "subtotal",
    "taxAmount",
    "totalAmount",
    "notes",
    "createdAt",
    "updatedAt"
FROM "Invoice";

DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";

CREATE UNIQUE INDEX "Invoice_paymentReference_key" ON "Invoice"("paymentReference");
CREATE UNIQUE INDEX "Invoice_workspaceId_invoiceNumber_key" ON "Invoice"("workspaceId", "invoiceNumber");
CREATE INDEX "Invoice_workspaceId_createdAt_idx" ON "Invoice"("workspaceId", "createdAt");
CREATE INDEX "Invoice_clientId_idx" ON "Invoice"("clientId");
CREATE INDEX "Invoice_recurringInvoiceId_idx" ON "Invoice"("recurringInvoiceId");
CREATE INDEX "Invoice_workspaceId_paymentReference_idx" ON "Invoice"("workspaceId", "paymentReference");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
