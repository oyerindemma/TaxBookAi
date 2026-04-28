import { redirect } from "next/navigation";

export const runtime = "nodejs";

export default function LegacyIntegrityAdminPage() {
  redirect("/dashboard/integrity");
}
