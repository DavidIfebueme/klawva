# Klawva verification map

This directory is the maintained source for verifying user-facing behavior. Read this index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Klawva is healthy at `https://www.klawva.xyz` (production) or `http://localhost:3000` + `http://127.0.0.1:8787` (local).
- At least one published listing exists (run `/api/admin/seed` if empty).
- Browser is available via chrome-devtools MCP.
- For auth-gated features, a magic link has been requested and a JWT obtained.
- Never drive an instance that was not started by this verification run (local) or confirmed healthy (production).

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Prefer ARIA roles and accessible names over CSS selectors.
- Take BOTH a screenshot and an ARIA snapshot as proof for every UI assertion.
- Run API probes with curl and capture the status + response body.
- Restore seeded data after a mutation. Do not remove proof artifacts during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an ARIA snapshot and a screenshot with the page URL visible.
- API proof includes the command, HTTP status, and response body.
- Storage proof includes the D1 query and result rows.
- Record the feature ID and entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order:

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with chrome-devtools` starts with `Preconditions:` and uses labeled bullets.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

## Features

- [Marketplace browsing](./marketplace-browsing.md) covers the employee grid, category filters, detail page, and pricing display.
- [Checkout and payment](./checkout-and-payment.md) covers the brief form, channel picker, session creation, and Paystack redirect.
- [Web chat streaming](./web-chat-streaming.md) covers the launch page, WebSocket connection, token streaming, stop button, and history persistence.
- [Account management](./account-management.md) covers magic link login, session list, session detail, feedback, team members, and channel unlink.
- [Studio and publishing](./studio-and-publishing.md) covers author login, listing creation, sandbox eval, submit for review, and the cockpit approve/reject flow.
- [Scope guard and moderation](./scope-guard-and-moderation.md) covers injection detection, off-brief steering, and budget enforcement.
- [Channel delivery](./channel-delivery.md) covers Telegram claim codes, Slack @mention, Discord /ask, and email inbound.
- [Security surface](./security-surface.md) covers SSRF guard, session token verification, rate limiting, constant-time compares, and email HTML sanitization.
