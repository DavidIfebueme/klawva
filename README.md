<div align="center">

# klawva

**Hire an AI employee for a shift. It does the work and files a report.**

Klawva is a marketplace for autonomous AI workers. You pick an employee, write a brief, pay for a shift, and read the mission report when the shift ends. Anyone can publish an employee as a listing.

[![Worker](https://github.com/DavidIfebueme/klawva/actions/workflows/worker.yml/badge.svg?branch=master)](https://github.com/DavidIfebueme/klawva/actions/workflows/worker.yml)
[![Hygiene](https://github.com/DavidIfebueme/klawva/actions/workflows/hygiene.yml/badge.svg)](https://github.com/DavidIfebueme/klawva/actions/workflows/hygiene.yml)
![Cloudflare Workers](https://img.shields.io/badge/runtime-Cloudflare%20Workers-f38020)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[Live site](https://klawva.xyz) · [How a shift works](#how-a-shift-works) · [Architecture](#architecture) · [Local development](#local-development)

</div>

---

> **Migration note.** klawva runs on Cloudflare. The old Python backend and the old Next frontend are frozen under `legacy/`, and nothing builds on them. The live product is the code under `apps/`. Keep `legacy/` only as a port reference.

## How a shift works

1. **Hire.** Pick an employee from the catalog and fill out its brief.
2. **Pay.** Paystack charges in Naira and funds the shift.
3. **Connect.** The employee opens a thread on your channel.
4. **Work.** The employee handles the brief inside a per-shift budget, with a bounded tool set.
5. **Report.** At the end of the window the employee files a structured mission report and delivers it.

```text
hire [1]
├── /checkout [1a] ← brief, duration, Paystack initialize
├── /webhooks/paystack [1b] ← signature verified, idempotent, ordered
└── activate [1c]
    ├── session state pending → active [1c1]
    ├── seed the wallet and the shift budget from the listing [1c2]
    └── employee opens the channel thread [1c3]

work [2]
└── for each employer message: [2a]
    ├── admitTurn [2a1] ← scope guard, injection screen, budget check, neuron cap
    ├── streamText on Workers AI [2a2] ← tools: web_search, fetch_url, extract_links
    └── recordAiUsage [2a3] ← per-model token counters

report [3]
├── at window_end, SessionAgent.alarm fires [3a]
├── generateReport [3b] ← summary and stats from the transcript only
└── deliverCompletion [3c] ← telegram, slack, email, claimed once per target
```

## Architecture

One Cloudflare Worker is the whole backend. It serves the built web app from its assets binding and answers `/api`. Shift state lives in one Durable Object per session, so a shift has a single writer and survives restarts. A second Durable Object holds each wallet.

```text
klawva [1]
├── apps/web [1a] ← Vite and React SPA, built into the Worker assets
│   ├── hire flow [1a1] ← /employees, /employees/:agent, /checkout
│   ├── shift room [1a2] ← /chat/:sessionId, /report/:sessionId
│   └── studio [1a3] ← author listings, sandbox, cockpit, admin review
└── apps/worker [1b] ← single Cloudflare Worker
    ├── index.ts [1b1] ← fetch, scheduled, and email handlers
    ├── app.ts [1b2] ← Effect HttpApi over /api and /health
    ├── session/SessionAgent [1b3] ← Durable Object per shift, SQLite backed
    ├── wallet/WalletAgent [1b4] ← Durable Object per user, debits and credits
    ├── channels/ [1b5] ← telegram, slack, discord, email
    ├── payments/ [1b6] ← paystack and breet, webhooks signature verified
    ├── agent/ [1b7] ← souls, tool registry, model runtime, neuron meter
    ├── listings/ + studio/ [1b8] ← catalog, publishing, sandbox eval
    └── db/ [1b9] ← D1 access and typed schema
```

Footnotes

| Marker | Context |
| --- | --- |
| [1b3] | `SessionAgent` extends `AIChatAgent` and persists turns with `ctx.storage.sql`. The capnweb transport is refused so the connection always hibernates. |
| [1b4] | `WalletAgent` holds the balance and rejects any debit that would take it below zero. |
| [1b7] | The runtime refuses a model call when the day's neuron count is near the cap, so the free tier stays a floor and not a hard dependency. |

## The employee catalog

Each employee is a listing. A listing carries a slug, a brief schema, a shift price, a model budget, and a system soul. The soul sets the output contract, and the brief schema decides which fields the hire form asks for.

| Employee | Slug | Category | What it does |
| --- | --- | --- | --- |
| Klawva Scrapper | `scrapper` | data | Finds, monitors, and extracts data from public sites |
| Klawva Researcher | `researcher` | research | Reads many sources and writes a cited report |
| Klawva Job Seeker | `jobseeker` | careers | Finds and ranks job openings against a profile |
| Klawva Lead Scout | `leadscout` | sales | Finds and qualifies leads against an ideal customer profile |

Shift price and model budget are set per listing in [`apps/worker/src/listings/definitions.ts`](apps/worker/src/listings/definitions.ts). System souls live in [`apps/worker/src/agent/souls.ts`](apps/worker/src/agent/souls.ts).

The old WhatsApp Vendor employee is not built. WhatsApp is deferred.

## Stack

| Layer | Choice |
| --- | --- |
| Runtime | Cloudflare Workers, one Worker for API and static assets |
| HTTP | Effect HttpApi on our own Workers adapter |
| Shift state | One Durable Object per session, SQLite backed |
| Wallet state | One Durable Object per user |
| Data | Cloudflare D1, typed schema in `apps/worker/src/db/schema.ts` |
| Model | Workers AI, `@cf/zai-org/glm-4.7-flash` for turns and `@cf/cloudflare/clef-flash` for checks |
| Frontend | Vite, React, React Router, Tailwind |
| Payments | Paystack for Naira. Breet for crypto, sandbox only |
| Channels | Telegram, Slack, Discord, Email |
| Connectors | MCP, brokered in `apps/worker/src/mcp/connectors.ts` |

## Channels and connectors

An employee talks to the employer over a channel. Email works by default, and the launch page links the other channels to the shift.

| Channel | Path | State |
| --- | --- | --- |
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

## Publishing an employee

The studio lets an author publish a listing without a deploy.

```text
studio [1]
├── /studio/login [1a] ← magic link
├── /studio [1b] ← author profile
├── /studio/listings/:id [1c] ← draft, brief fields, soul
├── runSandbox [1d] ← daily capped test runs
└── /studio/cockpit [1e] ← admin review queue
    ├── approve [1e1] ← listing goes live
    └── reject [1e2] ← with a reason
```

A sandbox eval grades a draft into a band, and the band sets the first status. A passing draft lands in `in_review`, then an admin approves or rejects it. Sandbox runs are capped per day.

## Repository layout

```text
klawva/
├── apps/
│   ├── worker/        # Cloudflare Worker: Effect HttpApi, Durable Objects, D1, Workers AI, channels, payments
│   │   ├── src/
│   │   ├── test/      # vitest suite
│   │   └── migrations/ # D1 SQL migrations, applied on deploy
│   └── web/           # Vite React SPA, built into the Worker assets
├── legacy/
│   ├── klawva-be/     # frozen Python backend. port only
│   └── klawva-fe/     # frozen Next frontend. UI reference only
├── docs/              # gitignored scratch, plus two tracked notes
├── AGENTS.md          # agent rules and repository conventions
└── README.md
```

`docs/` holds local scratch and is gitignored. Two files, `docs/architecture.md` and `docs/worker-lifecycle.md`, are tracked as reference notes.

## Local development

```bash
corepack enable
pnpm install

# Worker on http://127.0.0.1:8787
pnpm --dir apps/worker dev

# Web app on http://localhost:3000, proxying /api to the Worker
pnpm --dir apps/web dev
```

Secrets live in `~/.config/klawva/cloudflare.env` at mode 600, outside the repo. Source it before any `wrangler` command, and never commit a token.

## Checks

```bash
pnpm --dir apps/worker typecheck
pnpm --dir apps/worker test
```

`Worker` runs typecheck and the vitest suite on every pull request. `Hygiene` rejects committed archives and tracked files over 2 MB.

## Deploy

Push to `master` and [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) does the rest. It typechecks, runs the tests, builds the web app into the Worker assets, applies the D1 migrations, and runs `wrangler deploy`. The Worker is bound to `klawva.xyz` as a custom domain and serves the SPA from its assets binding.

## Status

| Area | State |
| --- | --- |
| Product | Live at [klawva.xyz](https://klawva.xyz) on Cloudflare Workers |
| Backend | `apps/worker`, deployed by the `Deploy` workflow |
| Frontend | `apps/web`, built into the Worker assets |
| Legacy | `legacy/klawva-be` (Python) and `legacy/klawva-fe` (Next). Frozen, port only |
| Channels | Telegram, Slack, Discord, and Email are deployed. WhatsApp is deferred |
| Payments | Paystack for Naira. Breet for crypto, sandbox only |
| Model | `@cf/zai-org/glm-4.7-flash` and `@cf/cloudflare/clef-flash` on Workers AI |

## Contributing

Private project. Contributions are not accepted.

## License

MIT. See [LICENSE](LICENSE).
