import { NextResponse } from "next/server";
import { sendPasswordResetEmail } from "@/lib/auth-email";
import {
  buildPasswordResetUrl,
  createPasswordResetToken,
  normalizeEmail,
  validateEmail,
} from "@/lib/auth";
import { logRouteError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type ForgotPasswordBody = {
  email?: string;
};

const SUCCESS_MESSAGE =
  "If an account exists for that email, we sent a password reset link.";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ForgotPasswordBody;
    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
    const emailError = validateEmail(email);

    if (emailError) {
      return NextResponse.json(
        {
          error: "Enter the email address linked to your account.",
          fieldErrors: {
            email: emailError,
          },
        },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        fullName: true,
      },
    });

    let debugResetUrl: string | undefined;

    if (user) {
      const { token, expiresAt } = await createPasswordResetToken(user.id);
      const resetUrl = buildPasswordResetUrl(token);
      const delivery = await sendPasswordResetEmail({
        email: user.email,
        fullName: user.fullName,
        resetUrl,
        expiresAt,
      });

      debugResetUrl = delivery.previewUrl;
    }

    return NextResponse.json({
      ok: true,
      message: SUCCESS_MESSAGE,
      ...(debugResetUrl ? { debugResetUrl } : {}),
    });
  } catch (error) {
    logRouteError("forgot password failed", error);
    return NextResponse.json(
      { error: "Password reset is unavailable right now. Please try again." },
      { status: 500 }
    );
  }
}
