import {
  redirectToCanonicalTaxCenter,
  type LegacyTaxCenterPageProps,
} from "../../_lib/tax-center-alias";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LegacyBankingTaxCentrePage({
  searchParams,
}: LegacyTaxCenterPageProps) {
  await redirectToCanonicalTaxCenter(searchParams);
}
