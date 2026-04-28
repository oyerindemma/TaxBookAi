import { redirect } from "next/navigation";

export const runtime = "nodejs";

export default function LegacyRecurringInvoicesPage() {
  redirect("/dashboard/invoices/recurring");
}
