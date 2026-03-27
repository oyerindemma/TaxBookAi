import "server-only";

export type DatabaseProvider = "sqlite" | "postgresql";
export type DeploymentStage = "development" | "preview" | "production";

type EnvironmentHealth = {
  deploymentStage: DeploymentStage;
  databaseProvider: DatabaseProvider;
  appUrl: string;
  allowStubPayments: boolean;
  hasOpenAiKey: boolean;
  hasPaystackKey: boolean;
  missing: string[];
  warnings: string[];
  errors: string[];
};

type EnvironmentHealthOptions = {
  strict?: boolean;
};

function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function hasAnyEnv(names: string[]) {
  return names.some((name) => Boolean(readEnv(name)));
}

function requireEnv(name: string) {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function parseBooleanEnv(name: string) {
  const value = readEnv(name).toLowerCase();
  if (!value) return null;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function inferDatabaseProviderFromUrl(databaseUrl: string): DatabaseProvider | null {
  if (!databaseUrl) return null;
  if (databaseUrl.startsWith("file:")) return "sqlite";
  if (databaseUrl.startsWith("postgres")) return "postgresql";
  return null;
}

function isVercelEnvironment() {
  return Boolean(readEnv("VERCEL") || readEnv("VERCEL_ENV") || readEnv("VERCEL_URL"));
}

function normalizeAbsoluteUrl(value: string, label: string) {
  const candidate = value.includes("://") ? value : `https://${value}`;

  try {
    const url = new URL(candidate);
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`${label} must be a valid absolute URL`);
  }
}

function getVercelUrlFallback() {
  const raw =
    readEnv("VERCEL_PROJECT_PRODUCTION_URL") ||
    readEnv("VERCEL_BRANCH_URL") ||
    readEnv("VERCEL_URL");

  if (!raw) return null;

  try {
    return normalizeAbsoluteUrl(raw, "VERCEL_URL");
  } catch {
    return null;
  }
}

function isLikelyNeonConnection(url: string) {
  return /neon\.tech/i.test(url);
}

function isLikelyPooledPostgresUrl(url: string) {
  return /pooler/i.test(url) || /pgbouncer/i.test(url);
}

function safelyResolveAppUrl() {
  try {
    return {
      value: getAppUrl(),
      error: null,
    };
  } catch (error) {
    return {
      value: "http://localhost:3000",
      error: error instanceof Error ? error.message : "APP_URL must be a valid absolute URL",
    };
  }
}

export function getDeploymentStage(): DeploymentStage {
  const vercelEnv = readEnv("VERCEL_ENV").toLowerCase();
  if (vercelEnv === "production" || vercelEnv === "preview" || vercelEnv === "development") {
    return vercelEnv;
  }

  if (process.env.NODE_ENV === "production") {
    return "production";
  }

  return "development";
}

export function getDatabaseProvider(): DatabaseProvider {
  const explicit = readEnv("DATABASE_PROVIDER").toLowerCase();
  if (explicit) {
    if (explicit === "sqlite" || explicit === "postgresql") {
      return explicit;
    }
    throw new Error("DATABASE_PROVIDER must be sqlite or postgresql");
  }

  return inferDatabaseProviderFromUrl(readEnv("DATABASE_URL")) ?? (isVercelEnvironment() ? "postgresql" : "sqlite");
}

export function validateDatabaseEnvironment() {
  const provider = getDatabaseProvider();
  const databaseUrl = requireEnv("DATABASE_URL");
  const directUrl = readEnv("DIRECT_URL");

  if (provider === "sqlite" && !databaseUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL must start with file: when DATABASE_PROVIDER=sqlite");
  }

  if (provider === "postgresql" && !databaseUrl.startsWith("postgres")) {
    throw new Error(
      "DATABASE_URL must be a PostgreSQL connection string when DATABASE_PROVIDER=postgresql"
    );
  }

  if (
    provider === "postgresql" &&
    directUrl &&
    !directUrl.startsWith("postgres")
  ) {
    throw new Error(
      "DIRECT_URL must be a PostgreSQL connection string when DATABASE_PROVIDER=postgresql"
    );
  }

  return {
    provider,
    databaseUrl,
    directUrl: directUrl || databaseUrl,
  };
}

export function getAppUrl() {
  const raw = readEnv("APP_URL") || getVercelUrlFallback() || "http://localhost:3000";
  return normalizeAbsoluteUrl(raw, "APP_URL");
}

export function getOptionalSessionCookieDomain() {
  return readEnv("SESSION_COOKIE_DOMAIN") || null;
}

export function getOpenAiServerConfig() {
  return {
    apiKey: requireEnv("OPENAI_API_KEY"),
    model: readEnv("OPENAI_MODEL") || "gpt-4o-mini",
    visionModel:
      readEnv("OPENAI_VISION_MODEL") || readEnv("OPENAI_MODEL") || "gpt-4o-mini",
    assistantModel:
      readEnv("OPENAI_ASSISTANT_MODEL") ||
      readEnv("OPENAI_MODEL") ||
      "gpt-4o-mini",
  };
}

export function hasOpenAiServerConfig() {
  return Boolean(readEnv("OPENAI_API_KEY"));
}

export function getPaystackServerConfig() {
  return {
    secretKey: requireEnv("PAYSTACK_SECRET_KEY"),
    webhookSecret: readEnv("PAYSTACK_WEBHOOK_SECRET") || requireEnv("PAYSTACK_SECRET_KEY"),
  };
}

export function hasPaystackServerConfig() {
  return Boolean(readEnv("PAYSTACK_SECRET_KEY"));
}

export function getInvoicePortalSecret() {
  const value =
    readEnv("PORTAL_LINK_SECRET") ||
    readEnv("PAYMENT_WEBHOOK_SECRET") ||
    readEnv("PAYSTACK_SECRET_KEY") ||
    readEnv("DATABASE_URL");

  if (!value) {
    throw new Error("PORTAL_LINK_SECRET is not configured");
  }

  return value;
}

export function getInvoiceReminderRuntimeConfig() {
  return {
    cronSecret:
      readEnv("INVOICE_REMINDER_CRON_SECRET") || readEnv("PAYMENT_WEBHOOK_SECRET") || null,
    whatsappWebhookUrl: readEnv("WHATSAPP_REMINDER_WEBHOOK_URL") || null,
    whatsappWebhookSecret: readEnv("WHATSAPP_REMINDER_WEBHOOK_SECRET") || null,
  };
}

export function getIntegrityAlertRuntimeConfig() {
  return {
    slackWebhookUrl: readEnv("SLACK_WEBHOOK_URL") || null,
    alertEmailFrom: readEnv("ALERT_EMAIL_FROM") || readEnv("EMAIL_FROM") || null,
    alertEmailTo: readEnv("ALERT_EMAIL_TO") || null,
  };
}

export function getRecurringInvoiceRuntimeConfig() {
  return {
    cronSecret:
      readEnv("RECURRING_INVOICE_CRON_SECRET") ||
      readEnv("INVOICE_REMINDER_CRON_SECRET") ||
      readEnv("PAYMENT_WEBHOOK_SECRET") ||
      null,
  };
}

export function getPaymentRuntimeConfig() {
  const deploymentStage = getDeploymentStage();
  const explicitStubSetting = parseBooleanEnv("ALLOW_STUB_PAYMENTS");

  return {
    webhookSecret: readEnv("PAYMENT_WEBHOOK_SECRET") || null,
    allowStubPayments:
      deploymentStage === "production"
        ? false
        : (explicitStubSetting ?? deploymentStage === "development"),
  };
}

export function getEnvironmentHealth(
  options: EnvironmentHealthOptions = {}
): EnvironmentHealth {
  const deploymentStage = getDeploymentStage();
  const provider = getDatabaseProvider();
  const databaseUrl = readEnv("DATABASE_URL");
  const directUrl = readEnv("DIRECT_URL");
  const strict = options.strict ?? deploymentStage === "production";
  const missing: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const smtpEnvNames = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"];
  const hasPasswordResetEmailConfig = smtpEnvNames.every((name) => Boolean(readEnv(name)));
  const appUrlResult = safelyResolveAppUrl();
  const allowStubPayments = getPaymentRuntimeConfig().allowStubPayments;

  if (!databaseUrl) {
    missing.push("DATABASE_URL");
    errors.push("DATABASE_URL is required");
  } else if (provider === "sqlite" && !databaseUrl.startsWith("file:")) {
    errors.push("DATABASE_URL must start with file: when DATABASE_PROVIDER=sqlite");
  } else if (provider === "postgresql" && !databaseUrl.startsWith("postgres")) {
    errors.push("DATABASE_URL must be a PostgreSQL connection string when DATABASE_PROVIDER=postgresql");
  }

  if (provider === "sqlite" && directUrl && !directUrl.startsWith("file:")) {
    errors.push("DIRECT_URL must start with file: when DATABASE_PROVIDER=sqlite");
  }

  if (provider === "postgresql" && directUrl && !directUrl.startsWith("postgres")) {
    errors.push(
      "DIRECT_URL must be a PostgreSQL connection string when DATABASE_PROVIDER=postgresql"
    );
  }

  if (provider === "postgresql" && deploymentStage === "production" && !directUrl) {
    missing.push("DIRECT_URL");
    errors.push("DIRECT_URL is required in production for Prisma migrations on PostgreSQL");
  } else if (provider === "postgresql" && !directUrl && strict) {
    warnings.push("DIRECT_URL is not set; Prisma migrations will fall back to DATABASE_URL");
  }

  if (appUrlResult.error) {
    errors.push(appUrlResult.error);
  }

  if (!readEnv("APP_URL")) {
    if (deploymentStage === "production") {
      missing.push("APP_URL");
      errors.push("APP_URL must be set explicitly in production");
    } else if (getVercelUrlFallback()) {
      warnings.push("APP_URL not set; falling back to the current Vercel deployment URL");
    } else {
      warnings.push("APP_URL not set; defaulting to http://localhost:3000");
    }
  }

  if (deploymentStage === "production" && appUrlResult.value.includes("localhost")) {
    errors.push("APP_URL cannot point to localhost in production");
  }

  if (!readEnv("OPENAI_API_KEY")) warnings.push("OPENAI_API_KEY not set; AI features will be unavailable");
  if (!readEnv("OPENAI_MODEL")) warnings.push("OPENAI_MODEL not set; defaulting to gpt-4o-mini");
  if (!readEnv("PAYSTACK_SECRET_KEY")) {
    missing.push("PAYSTACK_SECRET_KEY");
    if (deploymentStage === "production") {
      errors.push("PAYSTACK_SECRET_KEY is required in production");
    } else {
      warnings.push("PAYSTACK_SECRET_KEY not set; billing checkout will be unavailable");
    }
  }
  if (!readEnv("PAYSTACK_WEBHOOK_SECRET")) {
    missing.push("PAYSTACK_WEBHOOK_SECRET");
    if (deploymentStage === "production") {
      errors.push("PAYSTACK_WEBHOOK_SECRET is required in production for strict webhook verification");
    } else {
      warnings.push(
        "PAYSTACK_WEBHOOK_SECRET not set; webhook signature verification will fall back to PAYSTACK_SECRET_KEY"
      );
    }
  }
  if (!hasAnyEnv(["PAYSTACK_PLAN_GROWTH"])) {
    missing.push("PAYSTACK_PLAN_GROWTH");
    if (deploymentStage === "production") {
      errors.push("PAYSTACK_PLAN_GROWTH is required in production");
    } else {
      warnings.push("PAYSTACK_PLAN_GROWTH not set; Growth monthly checkout will be unavailable");
    }
  }
  if (!hasAnyEnv(["PAYSTACK_PLAN_GROWTH_ANNUAL"])) {
    missing.push("PAYSTACK_PLAN_GROWTH_ANNUAL");
    if (deploymentStage === "production") {
      errors.push("PAYSTACK_PLAN_GROWTH_ANNUAL is required in production");
    } else {
      warnings.push(
        "PAYSTACK_PLAN_GROWTH_ANNUAL not set; Growth annual checkout will be unavailable"
      );
    }
  }
  if (!hasAnyEnv(["PAYSTACK_PLAN_PROFESSIONAL", "PAYSTACK_PLAN_BUSINESS"])) {
    missing.push("PAYSTACK_PLAN_PROFESSIONAL");
    if (deploymentStage === "production") {
      errors.push(
        "PAYSTACK_PLAN_PROFESSIONAL or PAYSTACK_PLAN_BUSINESS is required in production"
      );
    } else {
      warnings.push(
        "PAYSTACK_PLAN_PROFESSIONAL or PAYSTACK_PLAN_BUSINESS not set; Professional monthly checkout will be unavailable"
      );
    }
  }
  if (!hasAnyEnv(["PAYSTACK_PLAN_PROFESSIONAL_ANNUAL", "PAYSTACK_PLAN_BUSINESS_ANNUAL"])) {
    missing.push("PAYSTACK_PLAN_PROFESSIONAL_ANNUAL");
    if (deploymentStage === "production") {
      errors.push(
        "PAYSTACK_PLAN_PROFESSIONAL_ANNUAL or PAYSTACK_PLAN_BUSINESS_ANNUAL is required in production"
      );
    } else {
      warnings.push(
        "PAYSTACK_PLAN_PROFESSIONAL_ANNUAL or PAYSTACK_PLAN_BUSINESS_ANNUAL not set; Professional annual checkout will be unavailable"
      );
    }
  }
  if (!hasAnyEnv(["PAYSTACK_PLAN_ENTERPRISE", "PAYSTACK_PLAN_ACCOUNTANT"])) {
    warnings.push(
      "PAYSTACK_PLAN_ENTERPRISE not set; Enterprise checkout automation remains unavailable and sales-led"
    );
  }
  if (!readEnv("PAYSTACK_PUBLIC_KEY")) {
    warnings.push(
      "PAYSTACK_PUBLIC_KEY not set; redirect checkout still works, but client-side Paystack flows cannot be enabled"
    );
  }
  if (!hasPasswordResetEmailConfig) {
    if (deploymentStage === "production") {
      errors.push(
        "SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and EMAIL_FROM must be configured in production for password reset delivery"
      );
    } else {
      warnings.push(
        "SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and EMAIL_FROM are not fully configured; password reset emails will only preview locally and will fail in production"
      );
    }
  }

  if (provider === "postgresql" && databaseUrl) {
    if (isLikelyNeonConnection(databaseUrl) && !isLikelyPooledPostgresUrl(databaseUrl)) {
      warnings.push(
        "DATABASE_URL appears to be a direct Neon connection; use the pooled connection string for app runtime"
      );
    }

    if (directUrl && isLikelyPooledPostgresUrl(directUrl)) {
      warnings.push(
        "DIRECT_URL appears to be pooled; use Neon's direct connection string for Prisma migrations"
      );
    }
  }

  if (deploymentStage === "production" && readEnv("ALLOW_STUB_PAYMENTS") === "true") {
    errors.push("ALLOW_STUB_PAYMENTS must not be true in production");
  }

  return {
    deploymentStage,
    databaseProvider: provider,
    appUrl: appUrlResult.value,
    allowStubPayments,
    hasOpenAiKey: Boolean(readEnv("OPENAI_API_KEY")),
    hasPaystackKey: Boolean(readEnv("PAYSTACK_SECRET_KEY")),
    missing: Array.from(new Set(missing)),
    warnings: Array.from(new Set(warnings)),
    errors: Array.from(new Set(errors)),
  };
}
