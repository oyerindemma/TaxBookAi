import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_EMAIL = process.env.TAX_ENGINE_DEMO_EMAIL || "tax-engine-demo@taxbook.app";
const DEMO_PASSWORD = process.env.TAX_ENGINE_DEMO_PASSWORD || "TaxEngine123!";
const DEMO_NAME = process.env.TAX_ENGINE_DEMO_NAME || "Tax Engine Demo";

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL.toLowerCase() },
    update: {
      fullName: DEMO_NAME,
      password: passwordHash,
    },
    create: {
      email: DEMO_EMAIL.toLowerCase(),
      fullName: DEMO_NAME,
      password: passwordHash,
      role: "USER",
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: "Tax Engine Verification Workspace",
      members: {
        create: {
          userId: user.id,
          role: "OWNER",
        },
      },
      subscription: {
        create: {
          plan: "PROFESSIONAL",
          status: "active",
        },
      },
      businessProfile: {
        create: {
          businessName: "TaxBook AI Demo Workspace",
          businessType: "Accounting firm",
          industry: "Professional services",
          country: "Nigeria",
          state: "Lagos",
          taxIdentificationNumber: "TIN-WORKSPACE-001",
          defaultCurrency: "NGN",
          fiscalYearStartMonth: 1,
          onboardingCompletedAt: new Date("2026-03-01T00:00:00.000Z"),
        },
      },
    },
  });

  const clientBusiness = await prisma.clientBusiness.create({
    data: {
      workspaceId: workspace.id,
      name: "Lagos Advisory Services",
      legalName: "Lagos Advisory Services Ltd",
      industry: "Consulting",
      country: "Nigeria",
      state: "Lagos",
      taxIdentificationNumber: "TIN-CB-001",
      vatRegistrationNumber: "VAT-CB-001",
      defaultCurrency: "NGN",
      notes: "Verification business for the tax engine.",
    },
  });

  const [revenueCategory, operationsCategory, rentCategory, professionalCategory, complianceCategory] =
    await Promise.all([
      prisma.transactionCategory.create({
        data: {
          clientBusinessId: clientBusiness.id,
          name: "Revenue",
          type: "INCOME",
        },
      }),
      prisma.transactionCategory.create({
        data: {
          clientBusinessId: clientBusiness.id,
          name: "Operations",
          type: "EXPENSE",
        },
      }),
      prisma.transactionCategory.create({
        data: {
          clientBusinessId: clientBusiness.id,
          name: "Rent and utilities",
          type: "EXPENSE",
        },
      }),
      prisma.transactionCategory.create({
        data: {
          clientBusinessId: clientBusiness.id,
          name: "Professional fees",
          type: "EXPENSE",
        },
      }),
      prisma.transactionCategory.create({
        data: {
          clientBusinessId: clientBusiness.id,
          name: "Tax and compliance",
          type: "EXPENSE",
        },
      }),
    ]);

  const [vendorGood, vendorMissingTin] = await Promise.all([
    prisma.vendor.create({
      data: {
        clientBusinessId: clientBusiness.id,
        name: "Prime Office Supplies",
        taxIdentificationNumber: "TIN-VENDOR-001",
      },
    }),
    prisma.vendor.create({
      data: {
        clientBusinessId: clientBusiness.id,
        name: "Apex Consulting Partners",
      },
    }),
  ]);

  const client = await prisma.client.create({
    data: {
      workspaceId: workspace.id,
      name: "Northwind Retail",
      companyName: "Northwind Retail Ltd",
      email: "finance@northwind-retail.test",
      phone: "+2348000011111",
      address: "Victoria Island, Lagos",
      taxId: "TIN-CLIENT-001",
    },
  });

  const invoiceOne = await prisma.invoice.create({
    data: {
      workspaceId: workspace.id,
      clientId: client.id,
      clientBusinessId: clientBusiness.id,
      invoiceNumber: "TAX-INV-001",
      status: "PAID",
      issueDate: new Date("2026-03-04T00:00:00.000Z"),
      dueDate: new Date("2026-03-14T00:00:00.000Z"),
      subtotal: 20000000,
      taxAmount: 1500000,
      totalAmount: 21500000,
      vatTreatment: "OUTPUT",
      taxCategory: "SALES_SERVICES",
      taxEvidenceStatus: "VERIFIED",
      sourceDocumentNumber: "TAX-INV-001",
      notes: "Monthly advisory retainer",
      items: {
        create: [
          {
            description: "Monthly advisory retainer",
            quantity: 1,
            unitPrice: 20000000,
            taxRate: 7.5,
            lineTotal: 21500000,
          },
        ],
      },
    },
  });

  await prisma.invoice.create({
    data: {
      workspaceId: workspace.id,
      clientId: client.id,
      clientBusinessId: clientBusiness.id,
      invoiceNumber: "TAX-INV-002",
      status: "SENT",
      issueDate: new Date("2026-03-18T00:00:00.000Z"),
      dueDate: new Date("2026-03-25T00:00:00.000Z"),
      subtotal: 10000000,
      taxAmount: 100000,
      totalAmount: 10100000,
      vatTreatment: "OUTPUT",
      taxCategory: "SALES_SERVICES",
      taxEvidenceStatus: "ATTACHED",
      sourceDocumentNumber: "TAX-INV-002",
      notes: "Intentionally mismatched VAT math for verification",
      items: {
        create: [
          {
            description: "Project support services",
            quantity: 1,
            unitPrice: 10000000,
            taxRate: 7.5,
            lineTotal: 10100000,
          },
        ],
      },
    },
  });

  await prisma.ledgerTransaction.createMany({
    data: [
      {
        clientBusinessId: clientBusiness.id,
        categoryId: revenueCategory.id,
        transactionDate: new Date("2026-03-03T00:00:00.000Z"),
        description: "Advisory revenue collection",
        reference: "REV-001",
        direction: "MONEY_IN",
        amountMinor: 5000000,
        currency: "NGN",
        vatAmountMinor: 0,
        whtAmountMinor: 0,
        vatTreatment: "NONE",
        whtTreatment: "NONE",
        taxCategory: "SALES_SERVICES",
        taxEvidenceStatus: "ATTACHED",
        sourceDocumentNumber: "REV-001",
        origin: "MANUAL",
        reviewStatus: "POSTED",
      },
      {
        clientBusinessId: clientBusiness.id,
        vendorId: vendorGood.id,
        categoryId: operationsCategory.id,
        transactionDate: new Date("2026-03-05T00:00:00.000Z"),
        description: "Office supplies purchase",
        reference: "OPS-001",
        direction: "MONEY_OUT",
        amountMinor: 1075000,
        currency: "NGN",
        vatAmountMinor: 75000,
        whtAmountMinor: 0,
        vatTreatment: "INPUT",
        whtTreatment: "NONE",
        taxCategory: "PURCHASE_GOODS",
        taxEvidenceStatus: "VERIFIED",
        sourceDocumentNumber: "OPS-001",
        origin: "MANUAL",
        reviewStatus: "POSTED",
      },
      {
        clientBusinessId: clientBusiness.id,
        vendorId: vendorMissingTin.id,
        categoryId: professionalCategory.id,
        transactionDate: new Date("2026-03-07T00:00:00.000Z"),
        description: "Consulting retainer",
        reference: "PROF-001",
        direction: "MONEY_OUT",
        amountMinor: 1100000,
        currency: "NGN",
        vatAmountMinor: 0,
        whtAmountMinor: 0,
        vatTreatment: "NONE",
        whtTreatment: "NONE",
        taxCategory: "PROFESSIONAL_SERVICE",
        taxEvidenceStatus: "PENDING",
        sourceDocumentNumber: "PROF-001",
        origin: "MANUAL",
        reviewStatus: "POSTED",
      },
      {
        clientBusinessId: clientBusiness.id,
        vendorId: vendorGood.id,
        categoryId: rentCategory.id,
        transactionDate: new Date("2026-03-10T00:00:00.000Z"),
        description: "Office rent payment",
        reference: "RENT-001",
        direction: "MONEY_OUT",
        amountMinor: 1100000,
        currency: "NGN",
        vatAmountMinor: 0,
        whtAmountMinor: 100000,
        vatTreatment: "NONE",
        whtTreatment: "PAYABLE",
        taxCategory: "RENT",
        taxEvidenceStatus: "ATTACHED",
        sourceDocumentNumber: "RENT-001",
        origin: "MANUAL",
        reviewStatus: "POSTED",
      },
      {
        clientBusinessId: clientBusiness.id,
        vendorId: vendorGood.id,
        categoryId: complianceCategory.id,
        transactionDate: new Date("2026-03-12T00:00:00.000Z"),
        description: "FIRS penalty settlement",
        reference: "PENALTY-001",
        direction: "MONEY_OUT",
        amountMinor: 300000,
        currency: "NGN",
        vatAmountMinor: 0,
        whtAmountMinor: 0,
        vatTreatment: "NONE",
        whtTreatment: "NONE",
        taxCategory: "TAX_PAYMENT",
        taxEvidenceStatus: "ATTACHED",
        sourceDocumentNumber: "PENALTY-001",
        origin: "MANUAL",
        reviewStatus: "POSTED",
      },
    ],
  });

  const uploadOne = await prisma.bookkeepingUpload.create({
    data: {
      workspaceId: workspace.id,
      clientBusinessId: clientBusiness.id,
      uploadedByUserId: user.id,
      fileName: "march-subscription-receipt.pdf",
      fileType: "application/pdf",
      sourceType: "INVOICE",
      documentType: "INVOICE",
      status: "READY_FOR_REVIEW",
    },
  });

  const uploadTwo = await prisma.bookkeepingUpload.create({
    data: {
      workspaceId: workspace.id,
      clientBusinessId: clientBusiness.id,
      uploadedByUserId: user.id,
      fileName: "march-subscription-receipt-copy.pdf",
      fileType: "application/pdf",
      sourceType: "INVOICE",
      documentType: "INVOICE",
      status: "READY_FOR_REVIEW",
    },
  });

  await prisma.bookkeepingDraft.createMany({
    data: [
      {
        uploadId: uploadOne.id,
        vendorId: vendorMissingTin.id,
        categoryId: professionalCategory.id,
        proposedDate: new Date("2026-03-15T00:00:00.000Z"),
        description: "Cloud accounting subscription",
        documentNumber: "SUB-2026-03",
        vendorName: vendorMissingTin.name,
        suggestedCategoryName: "Professional fees",
        direction: "MONEY_OUT",
        subtotalMinor: 1000000,
        amountMinor: 1000000,
        totalAmountMinor: 1000000,
        currency: "NGN",
        vatAmountMinor: 0,
        whtAmountMinor: 0,
        vatTreatment: "NONE",
        whtTreatment: "NONE",
        taxCategory: "PURCHASE_SERVICES",
        taxEvidenceStatus: "MISSING",
        reviewStatus: "APPROVED",
        approvedAt: new Date("2026-03-16T00:00:00.000Z"),
      },
      {
        uploadId: uploadTwo.id,
        vendorId: vendorMissingTin.id,
        categoryId: professionalCategory.id,
        proposedDate: new Date("2026-03-15T00:00:00.000Z"),
        description: "Cloud accounting subscription",
        documentNumber: "SUB-2026-03",
        vendorName: vendorMissingTin.name,
        suggestedCategoryName: "Professional fees",
        direction: "MONEY_OUT",
        subtotalMinor: 1000000,
        amountMinor: 1000000,
        totalAmountMinor: 1000000,
        currency: "NGN",
        vatAmountMinor: 0,
        whtAmountMinor: 0,
        vatTreatment: "NONE",
        whtTreatment: "NONE",
        taxCategory: "PURCHASE_SERVICES",
        taxEvidenceStatus: "MISSING",
        reviewStatus: "APPROVED",
        approvedAt: new Date("2026-03-16T00:00:00.000Z"),
      },
    ],
  });

  console.log(
    JSON.stringify(
      {
        email: DEMO_EMAIL.toLowerCase(),
        password: DEMO_PASSWORD,
        userId: user.id,
        workspaceId: workspace.id,
        clientBusinessId: clientBusiness.id,
        invoiceId: invoiceOne.id,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
