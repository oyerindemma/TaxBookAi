import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getInvoiceDetailById } from "@/lib/invoice-records";
import {
  buildInvoicePortalCookieOptions,
  INVOICE_PORTAL_COOKIE_NAME,
  validateInvoicePortalToken,
} from "@/lib/invoice-portal";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    token?: string;
  }>;
};

function redirectToPortal(req: Request, state: string) {
  const url = new URL("/portal", req.url);
  url.searchParams.set("state", state);
  return NextResponse.redirect(url);
}

export async function GET(req: Request, context: RouteContext) {
  const { token } = await context.params;
  const validation = validateInvoicePortalToken(token);

  if (!validation.ok) {
    return redirectToPortal(req, validation.reason);
  }

  const invoice = await getInvoiceDetailById(validation.payload.invoiceId);
  if (!invoice) {
    return redirectToPortal(req, "missing");
  }

  if (invoice.status === "DRAFT") {
    return redirectToPortal(req, "not_ready");
  }

  await logAudit({
    workspaceId: invoice.workspaceId,
    actorUserId: null,
    action: "INVOICE_PORTAL_VIEWED",
    metadata: {
      invoiceId: invoice.id,
      paymentReference: invoice.paymentReference,
      access: "magic_link",
    },
  });

  const response = NextResponse.redirect(new URL(`/portal/invoices/${invoice.id}`, req.url));
  response.cookies.set(
    INVOICE_PORTAL_COOKIE_NAME,
    token ?? "",
    buildInvoicePortalCookieOptions(new Date(validation.payload.exp))
  );
  return response;
}
