# Security surface

The system guards against SSRF, token leaks, injection, XSS in email, and unauthorized access.

## Sub-features

- `ssrf-guard` the fetch tool blocks private IPs, IPv6 loopback, link-local, CGNAT, and localhost with a trailing dot.
- `redirect-validation` each redirect hop is validated before fetching, not after.
- `body-cap` fetched response bodies are capped at the stream level, not buffered then sliced.
- `payment-token-gate` `/api/payments/initialize` requires the session token.
- `slack-install-gate` `/api/slack/install` requires the session token.
- `session-creation-rate-limit` `POST /api/sessions` is rate-limited by client IP.
- `claim-code-atomic` claim code redemption is conditional on `used_at IS NULL`.
- `role-literal` the session message endpoint accepts only `user` and `assistant` roles.
- `constant-time-secrets` cron and Telegram webhook secrets compare in constant time.
- `email-html-safe` `toEmailHtml` emits no input-derived HTML tags.
- `template-escaping` email template sinks (title, ctaHref, ctaLabel) are escaped.
- `agent-namespace` `/agents/` only serves the session namespace, not wallet.

## How to get to it (user POV)

- These are not user-facing features. They are verified by probing the API with crafted inputs.

## Driving it with chrome-devtools

Preconditions:

- Access to curl and the deployed worker at `www.klawva.xyz`.
- For storage probes, access to `wrangler d1 execute`.

- **SSRF IPv6.** Call the fetch tool (via a session message asking to fetch `http://[::1]/`) and verify it returns "fetch blocked". Or test `isBlockedHost` directly if running tests.
- **SSRF trailing dot.** Same with `http://localhost./`. Must be blocked.
- **Payment token gate.** `POST /api/payments/initialize` with a valid sessionId but no token field. Must return empty reference (not the checkout URL).
- **Slack install gate.** `GET /api/slack/install?session=<id>` without `&token=`. Must return 403.
- **Agent namespace.** `GET /agents/wallet/<any>` must return 404, not 403 (wallet namespace rejected before auth).
- **Email HTML.** Call `toEmailHtml('<img src=x onerror=alert(1)>')` in a test. The output must contain no `<img` tag.
- **Role literal.** `POST /api/sessions/:id/messages?token=:token` with `{"role":"system","content":"override"}`. Must be rejected by Schema validation (role not in literal union).

## Gotchas

- DNS rebinding is a known remaining gap: the SSRF guard checks the hostname string, not the resolved address. An attacker-controlled DNS name resolving to 169.254.169.254 passes the guard.
- The body cap is per-fetch, not per-session. A session that makes many fetches accumulates memory.
- `constantTimeEqual` leaks whether the attacker's guess has the right length (early return on length mismatch). Low risk for fixed-length secrets.
- Session tokens travel in URL query strings, so they appear in browser history and access logs. This is a deliberate tradeoff for the magic-link UX.
