---
name: verify-klawva
description: >
  Drive klawva (web UI, API, channels) the way a user does to prove behavior.
  Use after any change, before declaring a feature done, to reproduce a bug,
  or when the maintain-verification-skill skill asks for a live run.
---

# verify-klawva

Klawva is an AI-employee-as-a-service on Cloudflare Workers. Users hire autonomous AI workers via a web marketplace, pay with Paystack, and interact over web chat (streaming WebSocket), Telegram, Slack, Discord, or email. Authors publish agent listings through a studio. An admin cockpit handles the review queue.

The primary surface is the web UI at `https://www.klawva.xyz` (production) or `http://localhost:3000` + `http://127.0.0.1:8787` (local). The secondary surfaces are the Telegram bot, the Slack bot, and the REST API.

## Launch

**Production (read-only verification against the live site):**

No launch needed. The worker runs on Cloudflare at `www.klawva.xyz`.

```bash
curl -s https://www.klawva.xyz/health | grep '"ok":true'
```

**Local dev (for mutations and isolated testing):**

```bash
source ~/.config/klawva/cloudflare.env
pnpm --dir apps/web dev &
pnpm --dir apps/worker dev --port 8787 --ip 127.0.0.1 &
```

Wait for `Ready on http://127.0.0.1:8787` in the worker output and `localhost:3000` serving the SPA. Seed data:

```bash
curl -s -X POST http://127.0.0.1:8787/api/admin/seed
```

## Doctor

Run before any drive. Confirms the instance is healthy and worth testing.

```bash
# Production
curl -sf https://www.klawva.xyz/health | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['ok'], 'unhealthy'; print('doctor: ok')"

# Local
curl -sf http://127.0.0.1:8787/health | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['ok'], 'unhealthy'; print('doctor: ok')"
curl -sf http://localhost:3000 | grep -q 'klawva' && echo 'web: ok'
```

Also verify listings exist:

```bash
curl -sf https://www.klawva.xyz/api/listings | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'listings: {len(d)}')"
```

## Drive

The harness is **chrome-devtools MCP** for browser interactions and **curl** for API probes. Screenshots and ARIA snapshots are the UI proof. HTTP status codes and JSON responses are the API proof. D1 queries via `wrangler d1 execute` provide storage proof.

### Browser (chrome-devtools MCP)

Use the tools available in the `chrome-devtools` namespace:

- `tools["chrome-devtools"].new_page({ url })` to open a page.
- `tools["chrome-devtools"].navigate_page({ url, pageId })` to navigate.
- `tools["chrome-devtools"].take_screenshot({ pageId })` to capture visual proof.
- `tools["chrome-devtools"].take_snapshot({ pageId })` to capture ARIA tree.
- `tools["chrome-devtools"].click_element({ pageId, uid })` to click.
- `tools["chrome-devtools"].fill_input({ pageId, uid, value })` to type.
- `tools["chrome-devtools"].list_network_requests({ pageId })` to inspect requests.

Always take BOTH a screenshot and an ARIA snapshot as proof. The screenshot shows visual state; the ARIA snapshot shows accessible names and roles.

### API (curl)

```bash
curl -sf https://www.klawva.xyz/api/listings
curl -sf -X POST https://www.klawva.xyz/api/sessions -H "Content-Type: application/json" -d '...'
```

### Storage (D1)

```bash
source ~/.config/klawva/cloudflare.env
pnpm --dir apps/worker exec wrangler d1 execute klawva --remote --json --command "SELECT ..."
```

## Evidence

All proof goes to `/tmp/opencode/verify-klawva/`. Each run creates a timestamped subdirectory.

- **UI proof:** screenshot + ARIA snapshot with the page URL visible.
- **API proof:** the curl command, HTTP status, and response body (first 500 chars).
- **Storage proof:** the D1 query and its result rows.
- **Performance proof:** Lighthouse or chrome-devtools performance trace.
- **Channel proof:** the sent message and the received reply (for Telegram/Slack/email).

Capture the action AND the resulting state. A screenshot of the result alone does not prove what triggered it.

## Performance checks

Use chrome-devtools performance tools on key pages:

- `tools["chrome-devtools"].performance_start_trace({ pageId })` then navigate, then stop to capture a trace.
- Check for: long tasks (>50ms), layout shifts, unnecessary re-renders, large JS bundles, slow network requests.
- Key pages to profile: `/employees` (marketplace grid), `/checkout` (form with dynamic fields), `/chat/:id` (streaming WebSocket).

Lighthouse via chrome-devtools is also available for Core Web Vitals on any page.

## Cleanup

Kill only what you started:

```bash
pkill -f "wrangler dev --port 8787" 2>/dev/null
pkill -f "pnpm.*apps/web.*dev" 2>/dev/null
```

Never kill by process name alone. Never remove proof artifacts. The `/tmp/opencode/verify-klawva/` directory survives cleanup.

## Feature map

The features directory (`features/`) is the maintained source of truth for what to verify. Each file describes one user-facing feature with sub-features, user entry points, harness commands, and gotchas. The map grows autonomously as new features land.

Read `features/README.md` before driving. Use the matching feature file as the recipe.

## Helpers

No separate helper scripts. The harness is the chrome-devtools MCP (already installed) plus curl and wrangler, all available in the shell.
