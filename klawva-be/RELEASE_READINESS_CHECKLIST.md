# Klawva Backend Release Readiness Checklist

## Stage Gate

- [ ] All backend tests pass with `uv run pytest`.
- [ ] Lint and type checks pass with `uv run ruff check .` and `uv run mypy app`.
- [ ] No pending migrations are missing for changed models.
- [ ] Security settings are configured in target environment.

## Environment Configuration

- [ ] `DIGITALOCEAN_API_TOKEN` configured.
- [ ] `DIGITALOCEAN_API_BASE_URL`, region, size, and image settings validated.
- [ ] `GRADIENT_MODEL_ACCESS_KEY` configured.
- [ ] `PAYSTACK_SECRET_KEY` and `PAYSTACK_WEBHOOK_SECRET` configured.
- [ ] `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` configured.
- [ ] `BREVO_API_KEY`, sender, and contact recipient configured.
- [ ] `INTERNAL_SERVICE_TOKEN` configured.
- [ ] `RATE_LIMIT_PER_MINUTE` configured for expected traffic.
- [ ] `TELEGRAM_BOT_TOKEN_POOL` configured for launch.

## Webhook and Payment Validation

- [ ] Paystack webhook signature verification validated in staging.
- [ ] Stripe webhook signature verification validated in staging.
- [ ] Idempotent webhook replay confirmed for both providers.
- [ ] Session unlock on confirmed payment verified.

## Provisioning and Runtime Validation

- [ ] OpenClaw droplet create/tag/destroy paths validated against DigitalOcean API.
- [ ] Bootstrap endpoint validates expected agent profile and transitions session to active.
- [ ] 24-hour termination scheduler path validated with accelerated test window.
- [ ] Mission report generation and retrieval validated.

## Channel Validation

- [ ] WhatsApp QR endpoint returns refreshable QR payload.
- [ ] Telegram token assignment works for non-vendor agents.
- [ ] Vendor Telegram assignment is rejected by policy.

## Observability and Ops

- [ ] `/api/observability/metrics` and `/api/observability/alerts` checked in staging.
- [ ] Alert thresholds verified with synthetic metric injection.
- [ ] `OPERATIONS_RUNBOOK.md` reviewed and accepted by operators.

## Cutover Plan

- [ ] Deploy to staging and run smoke flow end-to-end.
- [ ] Deploy production build.
- [ ] Run production smoke checks (`/health`, `/ready`, sessions APIs, payment webhook endpoints).
- [ ] Monitor alerts and error rates for first release window.

## Rollback Plan

- [ ] Previous stable commit hash documented.
- [ ] Rollback command/process verified.
- [ ] Data safety checks defined for rollback execution.
