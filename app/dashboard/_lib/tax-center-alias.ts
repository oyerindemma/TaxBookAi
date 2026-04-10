import { redirect } from "next/navigation";

type LegacyTaxCenterSearchParams = Record<string, string | string[] | undefined>;

export type LegacyTaxCenterPageProps = {
  searchParams?: LegacyTaxCenterSearchParams | Promise<LegacyTaxCenterSearchParams>;
};

function buildQueryString(searchParams: LegacyTaxCenterSearchParams) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.length > 0) {
          params.append(key, item);
        }
      }

      continue;
    }

    if (typeof value === "string" && value.length > 0) {
      params.set(key, value);
    }
  }

  return params.toString();
}

export async function redirectToCanonicalTaxCenter(
  searchParams?: LegacyTaxCenterSearchParams | Promise<LegacyTaxCenterSearchParams>
) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const queryString = buildQueryString(resolvedSearchParams);

  redirect(queryString ? `/dashboard/tax-center?${queryString}` : "/dashboard/tax-center");
}
