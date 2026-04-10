export type AuthActionResponse<TFieldKey extends string> = {
  error?: string;
  details?: string;
  fieldErrors?: Partial<Record<TFieldKey, string>>;
};

export async function parseAuthActionResponse<TFieldKey extends string>(
  response: Response
) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.toLowerCase().includes("application/json")) {
    try {
      return {
        data: (await response.json()) as AuthActionResponse<TFieldKey>,
        fallbackText: null,
      };
    } catch {
      return {
        data: null,
        fallbackText: null,
      };
    }
  }

  try {
    const text = (await response.text()).trim();
    return {
      data: null,
      fallbackText: text || null,
    };
  } catch {
    return {
      data: null,
      fallbackText: null,
    };
  }
}

export function getSafeNextPath(raw: string | null) {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  return raw;
}
