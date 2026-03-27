import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().min(1),

  PAYSTACK_SECRET_KEY: z.string().min(1),
  PAYSTACK_PUBLIC_KEY: z.string().min(1),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),

  NODE_ENV: z.enum(["development", "production", "test"]),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid env:", parsed.error.flatten());
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;