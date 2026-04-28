# Beta Support And Error Logging Process

Last updated: 2026-04-28

This process keeps beta feedback actionable while protecting tenant data. It is
for preview and beta operations, not public-launch support.

## 1. Intake Channels

- Primary: shared beta support inbox.
- Secondary: pilot call notes.
- Emergency: direct maintainer escalation for data loss, payment, tenant leak,
  or blocked tax/report generation.

## 2. Required Ticket Fields

- Reporter name and company.
- User email.
- Workspace name or id.
- Workflow: signup, onboarding, banking import, review, categorisation, tax,
  reports, exports, invoices, payments, AI, offline, settings, billing.
- Environment: local, preview, production beta.
- Severity: P0, P1, P2, P3.
- Browser/device.
- Approximate time in Africa/Lagos timezone.
- URL and action attempted.
- Visible error message.
- `x-trace-id` response header if available.
- Screenshot or screen recording when safe.
- Whether real customer data was involved.

Do not ask users to send full bank statements, passwords, Paystack secrets, or
tax identifiers through chat. Use redacted samples where possible.

## 3. Severity Rules

- P0: tenant data leak, payment loss/duplicate charge, auth bypass, destructive
  data corruption, production outage.
- P1: golden-path blocker, tax snapshot cannot generate when transactions exist,
  reports/exports unusable, Paystack webhook/callback broken, workspace scoping
  uncertainty.
- P2: confusing flow with workaround, AI fallback issue, incomplete empty state,
  mobile usability issue, non-critical import failure.
- P3: copy polish, minor visual issue, slow but successful workflow.

## 4. First Response Targets

- P0: acknowledge within 30 minutes, pause affected beta workflow, create incident
  notes.
- P1: acknowledge same business day, provide workaround if available.
- P2: acknowledge within 2 business days.
- P3: batch into weekly triage.

## 5. Error Logging Workflow

1. Capture the user-facing error and `x-trace-id`.
2. Search route logs by trace id, route, workspace id, and time.
3. Check `/api/health?strict=1` for environment-level failures.
4. Check worker logs for compliance export failures.
5. Check Paystack dashboard for payment/webhook issues.
6. Check OpenAI availability only for AI-specific failures.
7. Reproduce in seeded preview where possible.
8. Link the issue to the feedback tracker and blocker register.

## 6. Resolution Notes

Every resolved ticket should include:

- Root cause.
- User impact.
- Fix or workaround.
- Test run.
- Release or commit reference.
- Whether pilot follow-up is needed.

## 7. Weekly Beta Review

- Review all P0/P1 issues first.
- Group P2/P3 by workflow.
- Choose the top 5 blockers by frequency and severity.
- Update `docs/beta-blocker-register.md`.
- Update pilot users with fixes that affect their workflows.
