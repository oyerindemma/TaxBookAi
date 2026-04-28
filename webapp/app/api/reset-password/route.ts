import { NextResponse } from "next/server";
import {
  buildSessionCookieOptions,
  resetPasswordWithToken,
  SESSION_COOKIE_NAME,
  validatePassword,
} from "@/lib/auth";
import { logRouteError } from "@/lib/logger";
import {
  buildWorkspaceCookieOptions,
  WORKSPACE_COOKIE_NAME,
} from "@/lib/workspaces";

export const runtime = "nodejs";

type ResetPasswordBody = {
  token?: string;
  password?: string;
  confirmPassword?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ResetPasswordBody;
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const confirmPassword =
      typeof body.confirmPassword === "string" ? body.confirmPassword : "";

    const fieldErrors: Record<string, string> = {};

    if (!token) {
      fieldErrors.token = "This password reset link is invalid. Request a new one.";
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      fieldErrors.password = passwordError;
    }

    if (!confirmPassword) {
      fieldErrors.confirmPassword = "Confirm your new password.";
    } else if (confirmPassword !== password) {
      fieldErrors.confirmPassword = "Passwords do not match.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json(
        {
          error: "Please correct the highlighted fields.",
          fieldErrors,
        },
        { status: 400 }
      );
    }

    const result = await resetPasswordWithToken(token, password);
    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          fieldErrors: {
            token: result.error,
          },
        },
        { status: result.status }
      );
    }

    const res = NextResponse.json({
      ok: true,
      message: "Your password has been reset. Log in with your new password.",
    });

    res.cookies.set(SESSION_COOKIE_NAME, "", {
      ...buildSessionCookieOptions(),
      maxAge: 0,
    });
    res.cookies.set(WORKSPACE_COOKIE_NAME, "", {
      ...buildWorkspaceCookieOptions(),
      maxAge: 0,
    });

    return res;
  } catch (error) {
    logRouteError("reset password failed", error);
    return NextResponse.json(
      { error: "We could not reset your password right now. Please try again." },
      { status: 500 }
    );
  }
}
