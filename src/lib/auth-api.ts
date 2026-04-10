import "server-only";

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  buildSessionCookieOptions,
  createSession,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { logRouteError } from "@/lib/logger";
import {
  buildWorkspaceCookieOptions,
  WORKSPACE_COOKIE_NAME,
} from "@/lib/workspaces";

const AUTH_DEBUG_ENABLED = process.env.AUTH_DEBUG === "true";

type AuthErrorBody<TFieldKey extends string = string> = {
  error: string;
  details?: string;
  fieldErrors?: Partial<Record<TFieldKey, string>>;
};

export function createAuthJsonResponse<T>(body: T, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function createAuthErrorResponse<TFieldKey extends string = string>(
  body: AuthErrorBody<TFieldKey>,
  status: number
) {
  return createAuthJsonResponse(body, { status });
}

export async function parseJsonRequest<T>(request: Request) {
  try {
    return {
      ok: true as const,
      data: (await request.json()) as T,
    };
  } catch {
    return {
      ok: false as const,
      response: createAuthErrorResponse(
        { error: "Send a valid JSON request body." },
        400
      ),
    };
  }
}

export function setAuthCookies(
  response: NextResponse,
  input: {
    sessionToken: string;
    sessionExpiresAt: Date;
    workspaceId?: number | null;
  }
) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: input.sessionToken,
    ...buildSessionCookieOptions(input.sessionExpiresAt),
  });

  if (typeof input.workspaceId === "number") {
    response.cookies.set({
      name: WORKSPACE_COOKIE_NAME,
      value: String(input.workspaceId),
      ...buildWorkspaceCookieOptions(),
    });
  }
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    ...buildSessionCookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  });
  response.cookies.set({
    name: WORKSPACE_COOKIE_NAME,
    value: "",
    ...buildWorkspaceCookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  });
}

export async function createAuthenticatedResponse<TUser>(input: {
  userId: number;
  user: TUser;
  workspaceId?: number | null;
  status?: number;
}) {
  const { token, expiresAt } = await createSession(input.userId);
  const response = createAuthJsonResponse(
    {
      user: input.user,
    },
    { status: input.status ?? 200 }
  );

  setAuthCookies(response, {
    sessionToken: token,
    sessionExpiresAt: expiresAt,
    workspaceId: input.workspaceId,
  });

  return response;
}

export function isUniqueConstraintError(error: unknown, field?: string) {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  if (!field) {
    return true;
  }

  const target = error.meta?.target;
  const fields = Array.isArray(target)
    ? target
    : typeof target === "string"
      ? [target]
      : [];

  return fields.some(
    (candidate) =>
      candidate === field ||
      candidate.endsWith(`.${field}`) ||
      candidate.includes(`"${field}"`)
  );
}

export function isPrismaTransactionTimeoutError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2028"
  );
}

function shouldExposeAuthErrorDetails() {
  return process.env.NODE_ENV !== "production" || AUTH_DEBUG_ENABLED;
}

export function createAuthServerErrorResponse(
  route: string,
  error: unknown,
  input: {
    message: string;
    status?: number;
    metadata?: Record<string, unknown>;
  }
) {
  logRouteError(route, error, input.metadata);

  return createAuthErrorResponse(
    shouldExposeAuthErrorDetails()
      ? {
          error: input.message,
          details: error instanceof Error ? error.message : String(error),
        }
      : {
          error: input.message,
        },
    input.status ?? 500
  );
}
