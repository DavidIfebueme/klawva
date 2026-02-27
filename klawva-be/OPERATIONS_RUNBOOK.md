# Klawva Backend Operations Runbook

## Scope

This runbook covers operational response for backend runtime issues: provisioning failures, webhook failures, orphaned droplets, degraded API status, and emergency rollback.

## Core Metrics

- `requests_total`
- `requests_5xx`
- `provisioning_failed`
- `webhook_failures`
- `orphaned_droplets`

## Alert Thresholds

- `PROVISIONING_FAILURE_SPIKE`: `provisioning_failed >= 5`
- `WEBHOOK_FAILURE_SPIKE`: `webhook_failures >= 5`
- `ORPHANED_DROPLETS`: `orphaned_droplets >= 1`

## Response Playbooks

### Provisioning Failure Spike

1. Check DigitalOcean API token validity and account quota.
2. Check recent provisioning job errors from logs and DB records.
3. Verify OpenClaw image slug and droplet size/region availability.
4. Retry failed jobs with capped retries.
5. If unresolved, disable new provisioning and return graceful 503 for affected endpoints.

### Webhook Failure Spike

1. Validate webhook signatures and rotated secrets.
2. Confirm payment provider endpoint accessibility.
3. Replay failed webhook events idempotently.
4. Confirm session status updates are applied after replay.

### Orphaned Droplets

1. List droplets tagged with `klawva` and no active session.
2. Trigger cleanup destroy workflow.
3. Increment/verify orphaned droplet metric after cleanup pass.

## Rollback

1. Deploy previous known-good commit.
2. Run health check and smoke tests on `/health`, `/ready`, sessions status, and payment webhook endpoints.
3. Verify no pending migration mismatch.
4. Resume traffic after validation.

## Incident Notes Template

- Incident start UTC:
- Detection source:
- Affected endpoints:
- Impact summary:
- Immediate mitigation:
- Root cause:
- Corrective actions:
- Follow-up owner:
