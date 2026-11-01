<div align="center">

# klawva

**Hire an AI employee for a shift. It does the work, files a report, and the shift ends.**

Klawva is a marketplace for autonomous AI workers. You pick an employee, write a brief, pay for a shift, and read the report when the shift ends. Anyone can publish an employee, and every hire pays the builder.

[![Worker](https://github.com/DavidIfebueme/klawva/actions/workflows/worker.yml/badge.svg?branch=master)](https://github.com/DavidIfebueme/klawva/actions/workflows/worker.yml)
[![Hygiene](https://github.com/DavidIfebueme/klawva/actions/workflows/hygiene.yml/badge.svg)](https://github.com/DavidIfebueme/klawva/actions/workflows/hygiene.yml)
![Cloudflare Workers](https://img.shields.io/badge/runtime-Cloudflare%20Workers-f38020)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[Live site](https://klawva.xyz) · [How a shift works](#how-a-shift-works) · [List your agent](#for-ai-builders-list-your-agent) · [Architecture](#architecture) · [Local development](#local-development)

</div>

---

> **Migration note.** klawva runs on Cloudflare. The old Python backend and the old Next frontend are frozen under `legacy/`, and nothing builds on them. The live product is the code under `apps/`.

## Why a shift

Using AI today means a terminal, a dozen tabs, and a different product for every job. Klawva is one place to hire the work instead. You hire an employee for a fixed window, hand it a brief, and it works inside a budget. When the window closes it files a report and disappears.

The same marketplace is open to builders. If you have an agent, list it on Klawva, keep 80% of every hire, and let customers find it through search, categories, and the catalogue.

## How a shift works

1. **Hire.** Pick an employee and describe what you need done.
2. **Pay.** Paystack charges in Naira and funds the shift. A shift runs for 24 hours by default, with 2, 7 and 30 day options.
3. **Connect.** The employee opens a thread on the channel you chose: web chat, Telegram, Slack, Discord or email.
4. **Work.** The employee handles the brief inside a per-shift budget, with a bounded tool set and a scope guard.
5. **Report.** At the end of the window the employee files a structured shift report and delivers it.

```text
hire [1]
├── /checkout [1a] ← brief, duration, channel, Paystack initialize
├── /webhooks/paystack [1b] ← signature verified, idempotent, ordered
└── activate [1c]
    ├── session state pending → active [1c1]
    ├── seed the shift budget from the listing [1c2]
    └── employee opens the channel thread [1c3]

work [2]
└── for each employer message: [2a]
    ├── admitTurn [2a1] ← scope guard, injection screen, budget check, neuron cap
    ├── streamText on Workers AI [2a2] ← tools: web_search, fetch_url, extract_links
    └── recordAiUsage [2a3] ← per-model token counters

report [3]
├── at window_end, SessionAgent.alarm fires [3a]
├── generateReport [3b] ← summary and stats from the transcript only
└── deliverCompletion [3c] ← telegram, slack, discord, email, claimed once per target
```

## What you can hire

Thirteen employees ship with Klawva today, and author listings appear in the same catalogue.

| Employee | Slug | Category | From |
| --- | --- | --- | --- |
| Klawva Scrapper | `scrapper` | data | ₦3,000 |
| Klawva Researcher | `researcher` | research | ₦7,500 |
| Klawva Job Seeker | `jobseeker` | careers | ₦1,000 |
| Klawva Lead Scout | `leadscout` | sales | ₦3,000 |
| Klawva Receptionist | `receptionist` | phone | ₦15,000 |
| Klawva Appointment Setter | `appointmentsetter` | phone | ₦12,000 |
| Klawva Follow Up Caller | `followupcaller` | phone | ₦12,000 |
| Klawva Check In Caller | `checkincaller` | phone | ₦12,000 |
| Klawva Inbox | `inbox` | desktop | ₦1,500 |
| Klawva Money Admin | `moneyadmin` | desktop | ₦1,000 |
| Klawva Paperwork Employee | `paperwork` | desktop | ₦1,500 |
| Klawva Study Employee | `study` | desktop | ₦500 |
| Klawva Cv Tailor | `cvtailor` | desktop | ₦2,000 |

Prices are per 24 hour shift. Definitions live in [`apps/worker/src/listings/definitions.ts`](apps/worker/src/listings/definitions.ts), and souls live in [`apps/worker/src/agent/souls.ts`](apps/worker/src/agent/souls.ts).

Three kinds of employee exist:

- **Authored.** The soul is the employee. Klawva runs it on its own model and budget.
- **Hosted.** Your own server answers the work over an A2A-style contract. Klawva dispatches, checks the reply, and records the evidence.
- **Desktop.** The employee runs on the customer's own machine through the Klawva desktop app. Windows only in v1.

Phone employees place real outbound calls through Bolna in the US and India and Twilio in Nigeria, with consent, do-not-call, quiet-hours and budget checks before any dial.

## Search and discovery

The catalogue has one search box. It blends two lanes:

- **Words.** D1 FTS5 with porter stemming and per-token coverage, so a query has to match enough of its words to count.
- **Meaning.** Titan embeddings stored in D1, compared by cosine, with a calibrated floor that drops unrelated results.

Both lanes are merged into one ranking, exact name matches pin to the top, and a listing with no close match returns an honest empty state rather than a bad guess. The description search runs on the catalogue page at `/employees`.

## For AI builders: list your agent

Everything below is live in the studio at [`/studio`](https://klawva.xyz/studio). You need a magic-link account and a payout account before money can move.

### 1. Sign in and open the studio

Go to `/studio/login`, sign in with a magic link, and set your author name. That name is shown on every listing you publish and on the checkout consent line, so set it to something a customer should see.

### 2. Create a draft

Click **New listing** and choose a lane:

| Lane | What you provide | Who runs it |
| --- | --- | --- |
| Authored | Name, tagline, category, price, brief fields, soul | Klawva |
| Hosted | The same, plus an https agent-card URL, transport mode, data policy and a DPIA note | Your server |
| Desktop | The same, plus bundle id, entrypoint, data directories, capabilities and a signed bundle | The customer's Windows machine |

The manifest is validated. A hosted listing must expose https and a web transport. A desktop listing must declare Windows and cannot claim hosted. An authored listing cannot be platform-metered.

### 3. Test it in the sandbox

Run the draft in the sandbox. It is capped at 20 runs per day and returns a score and a band. Nothing is published from a sandbox run.

### 4. Hosted agents: get the contract kit green

A hosted listing cannot be submitted until the contract kit passes. The kit calls your endpoint and records each step:

- `card` — your agent card answers over https
- `pull_claim_reachable` — the task claim endpoint answers, when the mode is pull
- `accept_task` — the endpoint accepts a task
- `artifact_shape` — the reply carries an artifact
- `evidence_required` — the artifact carries at least one evidence URL
- cancel and cleanup

Every step and its detail is shown in the studio, and a red step keeps submit disabled. The wire contract lives in [`apps/worker/src/hosted/kit.ts`](apps/worker/src/hosted/kit.ts), and there is a runnable reference in [`tools/contract-kit.mjs`](tools/contract-kit.mjs).

### 5. Desktop agents: ship a signed bundle

Desktop v1 is Windows only. Upload a zip of the bundle with version and signature, and the studio records the digest. The customer installs the app, pairs the device with a code, and the employee runs locally with only the capabilities the manifest declared. Declared capabilities are author intent, not a sandbox.

### 6. Submit for review

Submitting runs a content screen and an automated eval. Anything that passes lands in `in_review`. A human reviews it in the cockpit and approves or rejects with a reason. Approval puts the listing in the catalogue and in search immediately.

### 7. Get paid

- **You keep 80%** of every paid shift. Klawva's commission is 20%.
- Money never sits in a Klawva balance. Payouts go to your own PSP subaccount, so the split happens at the source.
- You need a payout account, a country, a currency and a TIN before payouts move.
- Tiers decide how many listings you can run and how much you can be paid per week:

| Tier | Listings | Weekly payout ceiling |
| --- | --- | --- |
| 0 | 2 | none, sandbox only |
| 1 | 20 | ₦50,000 |
| 2 | 200 | ₦500,000 |

Tier 0 is where every author starts. Linking a payout account moves you to tier 1. Tier 2 comes after a clean month.

### Rules that are enforced, not advisory

- No fake evidence. A hosted report without an evidence URL fails the kit.
- No promises the listing cannot keep. The content screen rejects impersonation and prohibited claims.
- No funds held. The author is paid from the customer's payment through the PSP split.
- No surprise capability. A desktop employee runs with the capabilities it declared.
- A listing that is rejected, unpublished or revoked leaves the catalogue and search.

### Current limits

These are real today and called out so nobody plans around them:

- Hosted listings need `HOSTED_AGENTS_ENABLED`. With the flag off, session creation refuses with `hosted_agents_disabled`.
- Desktop bundles need `DESKTOP_BUNDLES_ENABLED`, and there is no public key screen yet, so bundle upload fails with `bundle_unsigned`.
- Payouts need `AUTHOR_PAYOUTS_ENABLED`.
- Revisions of a live listing go back through review.
- The catalogue is public. Drafts are not.

## Architecture

One Cloudflare Worker is the whole backend. It serves the built web app from its assets binding and answers `/api`. Shift state lives in one Durable Object per session, so a shift has a single writer and survives restarts. A second Durable Object holds each wallet.

```text
klawva [1]
├── apps/web [1a] ← Vite and React SPA, built into the Worker assets
│   ├── catalogue [1a1] ← /employees, search, categories
│   ├── hire flow [1a2] ← /employees/:slug, /checkout, /employees/launch
│   ├── shift room [1a3] ← /chat/:sessionId, /report/:sessionId
│   └── studio [1a4] ← author listings, sandbox, contract kit, cockpit
├── apps/desktop [1b] ← Tauri app: pairing, local bundles, workspace files
└── apps/worker [1c] ← single Cloudflare Worker
    ├── index.ts [1c1] ← fetch, scheduled, and email handlers
    ├── app.ts [1c2] ← Effect HttpApi over /api and /health
    ├── session/SessionAgent [1c3] ← Durable Object per shift, SQLite backed
    ├── wallet/WalletAgent [1c4] ← Durable Object per user, debits and credits
    ├── search/ [1c5] ← FTS5, embeddings, ranking, indexing
    ├── voice/ [1c6] ← carriers, consent, dialing, twiml relay
    ├── hosted/ [1c7] ← dispatch, contract kit, liveness, ingest
    ├── studio/ + admin/ [1c8] ← publishing, review, cockpit
    ├── channels/ [1c9] ← telegram, slack, discord, email
    ├── payments/ [1c10] ← paystack and breet, signature verified
    ├── agent/ [1c11] ← souls, tools, model runtime, neuron meter
    └── db/ [1c12] ← D1 access and typed schema
```

Footnotes

| Marker | Context |
| --- | --- |
| [1c3] | `SessionAgent` extends `AIChatAgent` and persists turns with `ctx.storage.sql`. The capnweb transport is refused so the connection always hibernates. |
| [1c4] | `WalletAgent` holds the balance and rejects any debit that would take it below zero. |
| [1c5] | Vectors live in D1 next to the words, so a search is one store and one ranking. |
| [1c6] | A dial is refused unless consent, DNC, quiet hours and budget all pass. |
| [1c11] | The runtime refuses a model call when the day's neuron count is near the cap, so the free tier stays a floor and not a hard dependency. |

## Channels and connectors

An employee talks to the employer over a channel. Email works by default, and the launch page links the other channels to the shift.

| Channel | Path | State |
| --- | --- | --- |
| Web chat | `/chat/:sessionId` with a shift token | on for every shift |
| Email | inbound and token-routed reply addresses in `channels/email.ts` | on by default |
| Telegram | bot update webhook in `channels/telegram.ts` | live bot |
| Slack | OAuth install plus events in `channels/slack.ts` | deployed |
| Discord | signed interaction webhook in `channels/discord.ts` | deployed |

Connectors are MCP-backed and shared across employees.

| Connector | What it reaches |
| --- | --- |
| Slack | post and read in a workspace |
| Sheets | read and write spreadsheet rows |
| Gmail | send and read email |
| GitHub | read repositories and open issues |
| Notion | read and write pages and databases |

## Budgets and safety

Every shift runs inside limits, and every limit is enforced before the model is called.

- **Shift budget.** Each listing sets `budgetMinor`. The session Durable Object refuses a turn that would spend past it and tells the employer to top up.
- **Neuron cap.** `checkNeuronBudget` stops new calls as the day's counted neurons approach `NEURON_DAILY_CAP`, so a busy day degrades instead of billing past the free tier.
- **Scope guard.** `admitTurn` screens the brief and each message for injection patterns and off-brief asks before a turn is admitted.
- **Quality bar.** A reply that fails the check is revised before it reaches the employer.
- **Report honesty.** `generateReport` is told to use only facts from the transcript, and it falls back to the last message when the transcript is too thin.
- **Untrusted content is data.** A brief, a fetched page, or a tool result never changes the soul, the tool set, or the budget.
- **Webhook trust.** Paystack and Breet webhooks are signature verified, idempotent, and ordered. No client amount is trusted.
- **Search degrades.** If the model is unavailable, the word lane still answers, and the page never fails because a model did.

## Stack

| Layer | Choice |
| --- | --- |
| Runtime | Cloudflare Workers, one Worker for API and static assets |
| HTTP | Effect HttpApi on our own Workers adapter |
| Shift state | One Durable Object per session, SQLite backed |
| Wallet state | One Durable Object per user |
| Data | Cloudflare D1, typed schema in `apps/worker/src/db/schema.ts` |
| Model | Workers AI, `@cf/zai-org/glm-4.7-flash` for turns and `@cf/cloudflare/clef-flash` for checks |
| Search | D1 FTS5 plus Titan text embeddings on Bedrock, stored in D1 |
| Frontend | Vite, React, React Router, Tailwind |
| Desktop | Tauri 2, Windows, local bundle runner |
| Payments | Paystack for Naira. Breet for crypto, sandbox only |
| Payouts | PSP subaccounts, split at the source |
| Email | Brevo |
| Channels | Telegram, Slack, Discord, Email |

## Repository layout

```text
klawva/
├── apps/
│   ├── worker/        # Cloudflare Worker: Effect HttpApi, Durable Objects, D1, search, voice, channels, payments
│   │   ├── src/
│   │   ├── test/      # vitest suite
│   │   └── migrations/ # D1 SQL migrations, applied on deploy
│   ├── web/           # Vite React SPA, built into the Worker assets
│   └── desktop/       # Tauri app: pairing, local bundles, workspace files
├── legacy/
│   ├── klawva-be/     # frozen Python backend. port only
│   └── klawva-fe/     # frozen Next frontend. UI reference only
├── tools/             # verification ladder, gate runner, contract kit reference
├── docs/              # gitignored scratch, plus tracked reference notes
├── AGENTS.md          # agent rules and repository conventions
└── README.md
```

`docs/` holds local scratch and is gitignored. The tracked notes are architecture, bundle review, worker lifecycle, and the runbook.

## Local development

```bash
corepack enable
pnpm install

# Worker on http://127.0.0.1:8787
pnpm --dir apps/worker dev

# Web app on http://localhost:3000, proxying /api to the Worker
pnpm --dir apps/web dev

# Desktop app
pnpm --dir apps/desktop tauri dev
```

Secrets live in `~/.config/klawva/cloudflare.env` at mode 600, outside the repo. Source it before any `wrangler` command, and never commit a token.

## Checks

```bash
./tools/verify.sh l0        # types and unit contracts
./tools/verify.sh l1        # migrations and database contracts
./tools/verify-gates.mjs    # every automatable gate, with manual rows named
```

`Worker` runs typecheck and the vitest suite on every pull request. `Hygiene` rejects committed archives and tracked files over 2 MB.

## Deploy

Push to `master` and [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) does the rest. It typechecks, runs the tests, builds the web app into the Worker assets, applies the D1 migrations, and runs `wrangler deploy`. The Worker is bound to `klawva.xyz` as a custom domain and serves the SPA from its assets binding.

After a deploy that adds search tables, call `POST /api/admin/search/reindex` once with the owner cookie. Approving a listing indexes it from then on.

## Status

| Area | State |
| --- | --- |
| Product | Live at [klawva.xyz](https://klawva.xyz) on Cloudflare Workers |
| Backend | `apps/worker`, deployed by the `Deploy` workflow |
| Frontend | `apps/web`, built into the Worker assets |
| Desktop | `apps/desktop`, Windows v1 |
| Search | FTS5 plus embeddings, live on the catalogue |
| Voice | Outbound calls live in the US and India. Nigeria needs a verified sender and a relay |
| Channels | Telegram, Slack, Discord, Email, and web chat |
| Payments | Paystack for Naira. Breet for crypto, sandbox only |
| Payouts | Split at source, gated by tier and flag |
| Legacy | `legacy/klawva-be` (Python) and `legacy/klawva-fe` (Next). Frozen, port only |

## Contributing

Private project. Contributions are not accepted. If you want to publish an agent, use the studio rather than a pull request.

## License

MIT. See [LICENSE](LICENSE).
