"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BUSINESS_TYPE_OPTIONS,
  FISCAL_YEAR_MONTH_OPTIONS,
  NIGERIA_STATE_OPTIONS,
} from "@/lib/business-profile";
import {
  buildWorkspaceOnboardingDashboardConfig,
  createWorkspaceOnboardingDefaults,
  getWorkspaceOnboardingProgress,
  MULTI_BUSINESS_NEED_OPTIONS,
  ONBOARDING_USER_TYPE_OPTIONS,
  TAX_APPLICABILITY_OPTIONS,
  type WorkspaceOnboardingFieldErrors,
  type WorkspaceOnboardingFormValues,
  type WorkspaceOnboardingSnapshot,
  validateWorkspaceOnboardingCompletion,
} from "@/lib/workspace-onboarding";

type NigerianOnboardingClientProps = {
  initialOnboarding: WorkspaceOnboardingSnapshot;
  workspaceLabel: string;
};

const STEP_DEFINITIONS = [
  {
    key: "profile",
    label: "How you work",
    description: "Tell TaxBook who you are and what kind of business you run.",
    fields: ["userType", "businessName", "businessType", "industry"] as const,
  },
  {
    key: "tax",
    label: "Tax setup",
    description: "Keep VAT and WHT guidance relevant from the start.",
    fields: ["state", "vatApplicability", "whtApplicability"] as const,
  },
  {
    key: "workspace",
    label: "Workspace setup",
    description: "We will shape your dashboard and first actions from these answers.",
    fields: ["multiBusinessNeed", "fiscalYearStartMonth"] as const,
  },
] as const;

function getStepIndex(step: WorkspaceOnboardingFormValues["currentStep"]) {
  return Math.max(
    0,
    STEP_DEFINITIONS.findIndex((item) => item.key === step)
  );
}

function formatSavedAt(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function choiceCardClassName(selected: boolean) {
  return `rounded-2xl border p-4 text-left transition ${
    selected
      ? "border-cyan/40 bg-cyan/5 shadow-sm shadow-cyan/10"
      : "border-border/60 bg-white hover:border-cyan/25"
  }`;
}

export default function NigerianOnboardingClient({
  initialOnboarding,
  workspaceLabel,
}: NigerianOnboardingClientProps) {
  const router = useRouter();
  const [values, setValues] = useState(() =>
    createWorkspaceOnboardingDefaults(initialOnboarding.values)
  );
  const [currentStep, setCurrentStep] = useState<
    WorkspaceOnboardingFormValues["currentStep"]
  >(initialOnboarding.values.currentStep);
  const [fieldErrors, setFieldErrors] = useState<WorkspaceOnboardingFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingAction, setSavingAction] = useState<"save_draft" | "complete" | null>(
    null
  );
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(
    initialOnboarding.draftSavedAt
  );

  const progress = getWorkspaceOnboardingProgress(values);
  const dashboardConfig = buildWorkspaceOnboardingDashboardConfig({
    workspaceName: values.businessName || workspaceLabel,
    values,
  });
  const currentStepIndex = getStepIndex(currentStep);
  const isLastStep = currentStepIndex === STEP_DEFINITIONS.length - 1;

  function updateField(field: keyof WorkspaceOnboardingFormValues, value: string) {
    setValues((current) => ({
      ...current,
      [field]: value,
    }));
    setFieldErrors((current) => {
      const next = { ...current } as Record<string, string | undefined>;
      next[field] = undefined;
      return next as WorkspaceOnboardingFieldErrors;
    });
    setMessage(null);
    setError(null);
  }

  async function persist(action: "save_draft" | "complete") {
    setSavingAction(action);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          currentStep,
          values: {
            ...values,
            currentStep,
          },
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "We could not save your onboarding setup.");
        setFieldErrors((data?.fieldErrors ?? {}) as WorkspaceOnboardingFieldErrors);
        return false;
      }

      const nextValues = createWorkspaceOnboardingDefaults(data?.onboarding?.values);
      setValues(nextValues);
      setCurrentStep(nextValues.currentStep);
      setLastSavedAt(data?.onboarding?.draftSavedAt ?? null);
      setFieldErrors({});
      setMessage(
        data?.message ??
          (action === "complete"
            ? "Setup complete."
            : "Saved. You can come back and continue anytime.")
      );

      if (action === "complete") {
        router.replace(data?.redirectTo ?? "/dashboard");
        return true;
      }

      return true;
    } catch {
      setError("Network issue. Check your connection and try again.");
      return false;
    } finally {
      setSavingAction(null);
    }
  }

  function validateCurrentStep() {
    const validation = validateWorkspaceOnboardingCompletion(values);
    const currentFields = new Set<string>(STEP_DEFINITIONS[currentStepIndex].fields);
    const filteredErrors = Object.fromEntries(
      Object.entries(validation.fieldErrors).filter(([field]) => currentFields.has(field))
    ) as WorkspaceOnboardingFieldErrors;

    setFieldErrors((current) => ({
      ...current,
      ...filteredErrors,
    }));

    if (Object.keys(filteredErrors).length > 0) {
      setError("Please answer the highlighted questions before moving on.");
      return false;
    }

    setError(null);
    return true;
  }

  function goToNextStep() {
    if (!validateCurrentStep()) {
      return;
    }

    const nextStep = STEP_DEFINITIONS[currentStepIndex + 1];
    if (!nextStep) {
      return;
    }

    setCurrentStep(nextStep.key);
    setValues((current) => ({
      ...current,
      currentStep: nextStep.key,
    }));
    setMessage(null);
  }

  function goToPreviousStep() {
    const previousStep = STEP_DEFINITIONS[currentStepIndex - 1];
    if (!previousStep) return;

    setCurrentStep(previousStep.key);
    setValues((current) => ({
      ...current,
      currentStep: previousStep.key,
    }));
    setError(null);
    setMessage(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await persist("complete");
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/60 bg-white/92 shadow-xl shadow-primary/10">
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              Nigeria setup
            </Badge>
            <Badge variant="outline" className="rounded-full border-cyan/20 bg-white text-cyan">
              {progress.answeredRequiredCount}/{progress.requiredFieldCount} answered
            </Badge>
          </div>
          <div className="space-y-2">
            <CardTitle>Set up this workspace in a way that fits how you work.</CardTitle>
            <CardDescription>
              Simple questions first. We will use your answers to decide what you see first,
              what tax tools show up early, and the next actions we suggest.
            </CardDescription>
          </div>
          <div className="space-y-2">
            <div className="h-2 rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full bg-gradient-primary transition-all"
                style={{ width: `${Math.max(progress.progressPercent, 8)}%` }}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {STEP_DEFINITIONS.map((step, index) => {
                const isActive = step.key === currentStep;
                const isComplete = index < currentStepIndex;

                return (
                  <button
                    key={step.key}
                    type="button"
                    onClick={() => {
                      setCurrentStep(step.key);
                      setValues((current) => ({
                        ...current,
                        currentStep: step.key,
                      }));
                      setError(null);
                      setMessage(null);
                    }}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      isActive
                        ? "border-cyan/35 bg-cyan/5 shadow-sm"
                        : isComplete
                          ? "border-emerald-200 bg-emerald-50"
                          : "border-border/60 bg-white"
                    }`}
                  >
                    <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                      Step {index + 1}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-950">
                      {step.label}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">
                      {step.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Workspace: <span className="font-medium text-foreground">{workspaceLabel}</span>
            {lastSavedAt ? ` · Last saved ${formatSavedAt(lastSavedAt)}` : ""}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-6">
            {currentStep === "profile" ? (
              <div className="space-y-6">
                <div className="space-y-3">
                  <Label>How do you use TaxBook?</Label>
                  <div className="grid gap-3">
                    {ONBOARDING_USER_TYPE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => updateField("userType", option.value)}
                        className={choiceCardClassName(values.userType === option.value)}
                        aria-pressed={values.userType === option.value}
                      >
                        <div className="text-sm font-medium text-slate-950">{option.label}</div>
                        <div className="mt-1 text-sm leading-6 text-slate-500">
                          {option.description}
                        </div>
                      </button>
                    ))}
                  </div>
                  {fieldErrors.userType ? (
                    <p className="text-sm text-destructive">{fieldErrors.userType}</p>
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="businessName">Business name</Label>
                    <Input
                      id="businessName"
                      value={values.businessName}
                      onChange={(event) => updateField("businessName", event.target.value)}
                      placeholder="Example: Adewale Foods Limited"
                      aria-invalid={fieldErrors.businessName ? "true" : "false"}
                    />
                    {fieldErrors.businessName ? (
                      <p className="text-sm text-destructive">{fieldErrors.businessName}</p>
                    ) : null}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="businessType">Business type</Label>
                    <select
                      id="businessType"
                      value={values.businessType}
                      onChange={(event) => updateField("businessType", event.target.value)}
                      aria-invalid={fieldErrors.businessType ? "true" : "false"}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">Select business type</option>
                      {BUSINESS_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.businessType ? (
                      <p className="text-sm text-destructive">{fieldErrors.businessType}</p>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Input
                    id="industry"
                    value={values.industry}
                    onChange={(event) => updateField("industry", event.target.value)}
                    placeholder="Example: Retail, logistics, technology, hospitality"
                    aria-invalid={fieldErrors.industry ? "true" : "false"}
                  />
                  {fieldErrors.industry ? (
                    <p className="text-sm text-destructive">{fieldErrors.industry}</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {currentStep === "tax" ? (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
                  <div className="grid gap-2">
                    <Label htmlFor="state">Main operating state</Label>
                    <select
                      id="state"
                      value={values.state}
                      onChange={(event) => updateField("state", event.target.value)}
                      aria-invalid={fieldErrors.state ? "true" : "false"}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">Select state</option>
                      {NIGERIA_STATE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.state ? (
                      <p className="text-sm text-destructive">{fieldErrors.state}</p>
                    ) : null}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="taxIdentificationNumber">TIN (optional)</Label>
                    <Input
                      id="taxIdentificationNumber"
                      value={values.taxIdentificationNumber}
                      onChange={(event) =>
                        updateField("taxIdentificationNumber", event.target.value)
                      }
                      placeholder="Add it now or later"
                      aria-invalid={fieldErrors.taxIdentificationNumber ? "true" : "false"}
                    />
                    {fieldErrors.taxIdentificationNumber ? (
                      <p className="text-sm text-destructive">
                        {fieldErrors.taxIdentificationNumber}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Does VAT apply to this business?</Label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {TAX_APPLICABILITY_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => updateField("vatApplicability", option.value)}
                        className={choiceCardClassName(values.vatApplicability === option.value)}
                        aria-pressed={values.vatApplicability === option.value}
                      >
                        <div className="text-sm font-medium text-slate-950">{option.label}</div>
                        <div className="mt-1 text-sm leading-6 text-slate-500">
                          {option.description}
                        </div>
                      </button>
                    ))}
                  </div>
                  {fieldErrors.vatApplicability ? (
                    <p className="text-sm text-destructive">
                      {fieldErrors.vatApplicability}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-3">
                  <Label>Does WHT apply to this business?</Label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {TAX_APPLICABILITY_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => updateField("whtApplicability", option.value)}
                        className={choiceCardClassName(values.whtApplicability === option.value)}
                        aria-pressed={values.whtApplicability === option.value}
                      >
                        <div className="text-sm font-medium text-slate-950">{option.label}</div>
                        <div className="mt-1 text-sm leading-6 text-slate-500">
                          {option.description}
                        </div>
                      </button>
                    ))}
                  </div>
                  {fieldErrors.whtApplicability ? (
                    <p className="text-sm text-destructive">
                      {fieldErrors.whtApplicability}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {currentStep === "workspace" ? (
              <div className="space-y-6">
                <div className="space-y-3">
                  <Label>Do you need more than one business setup?</Label>
                  <div className="grid gap-3">
                    {MULTI_BUSINESS_NEED_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => updateField("multiBusinessNeed", option.value)}
                        className={choiceCardClassName(values.multiBusinessNeed === option.value)}
                        aria-pressed={values.multiBusinessNeed === option.value}
                      >
                        <div className="text-sm font-medium text-slate-950">{option.label}</div>
                        <div className="mt-1 text-sm leading-6 text-slate-500">
                          {option.description}
                        </div>
                      </button>
                    ))}
                  </div>
                  {fieldErrors.multiBusinessNeed ? (
                    <p className="text-sm text-destructive">
                      {fieldErrors.multiBusinessNeed}
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="fiscalYearStartMonth">Fiscal year start month</Label>
                  <select
                    id="fiscalYearStartMonth"
                    value={values.fiscalYearStartMonth}
                    onChange={(event) =>
                      updateField("fiscalYearStartMonth", event.target.value)
                    }
                    aria-invalid={fieldErrors.fiscalYearStartMonth ? "true" : "false"}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {FISCAL_YEAR_MONTH_OPTIONS.map((option) => (
                      <option key={option.value} value={String(option.value)}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.fiscalYearStartMonth ? (
                    <p className="text-sm text-destructive">
                      {fieldErrors.fiscalYearStartMonth}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-cyan/15 bg-slate-50 p-4">
                  <div className="text-sm font-medium text-slate-950">
                    What TaxBook will set up for you
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    These answers shape what shows up first after onboarding.
                  </p>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                        Modules shown first
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {dashboardConfig.preferredModules.slice(0, 5).map((module) => (
                          <Badge
                            key={module.href}
                            variant="secondary"
                            className="rounded-full bg-white"
                          >
                            {module.label}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                        Suggested next steps
                      </div>
                      <div className="space-y-2">
                        {dashboardConfig.suggestedNextSteps.slice(0, 3).map((item) => (
                          <div
                            key={item.id}
                            className="rounded-xl border border-white bg-white px-3 py-2"
                          >
                            <div className="text-sm font-medium text-slate-950">
                              {item.label}
                            </div>
                            <div className="mt-1 text-xs leading-5 text-slate-500">
                              {item.description}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

            <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={goToPreviousStep}
                  disabled={currentStepIndex === 0 || savingAction !== null}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => persist("save_draft")}
                  disabled={savingAction !== null}
                >
                  {savingAction === "save_draft"
                    ? "Saving..."
                    : "Save and continue later"}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {!isLastStep ? (
                  <Button type="button" onClick={goToNextStep} disabled={savingAction !== null}>
                    Continue
                  </Button>
                ) : (
                  <Button type="submit" disabled={savingAction !== null}>
                    {savingAction === "complete" ? "Finishing setup..." : "Complete setup"}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-white/88 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Your TaxBook starting view</CardTitle>
          <CardDescription>
            We keep the language simple and bring the most useful tools closer to the top.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-border/60 bg-slate-50 p-4">
            <div className="text-sm font-medium text-slate-950">
              {dashboardConfig.welcomeTitle}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {dashboardConfig.welcomeDescription}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {dashboardConfig.highlights.map((item) => (
              <Badge key={item} variant="outline" className="rounded-full bg-white">
                {item}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
