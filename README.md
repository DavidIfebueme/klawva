# klawva

> **Migration in progress.** klawva is being rebuilt on Cloudflare. The old Python and Next code is frozen under `legacy/`. The new stack lands under `apps/`. Nothing here is deployed yet.

Klawva is an AI employee platform. You hire an agent for a short shift, it works autonomously, and it files a mission report. Agents are published as listings, so the platform grows into a marketplace where anyone can publish an agent, hire one, and get paid.

## status

| Area | State |
|---|---|
| Product | Being revived. Server is gone, rebuilding on Cloudflare |
| Backend | New stack in progress under `apps/worker`. Old code frozen in `legacy/klawva-be` |
| Frontend | UI being ported to Vite and React under `apps/web`. Old code frozen in `legacy/klawva-fe` |
| Domain | klawva.xyz on Vercel. Worker reached through a Vercel `/api` rewrite |
| Channels | Telegram first, one bot. WhatsApp deferred |
| Payments | Paystack for NGN. Breet for crypto, sandbox only and hidden |
| Model | `@cf/zai-org/glm-4.7-flash` on Cloudflare Workers AI, free tier |

## how it works

1. hire. Pick an agent and fill out a brief.
2. pay. Paystack for Naira. The wallet funds the shift.
3. connect. The agent opens a Telegram chat through a deep link.
4. work. The agent handles the task in an isolated runtime with a per-shift budget.
5. report. At shift end the agent files a structured mission report.

## new stack

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers |
| HTTP | Effect HttpApi on our own Workers adapter |
| State | One Durable Object per session, SQLite backed |
| Data | Cloudflare D1 |
| Files | Cloudflare R2 |
| Model | Cloudflare Workers AI |
| Frontend | Vite, React, React Router, Tailwind |
| Hosting | Worker on Cloudflare, frontend on Vercel |
| Payments | Paystack, plus Breet for crypto later |

## project structure

```
klawva/
├── apps/
│   ├── worker/        # Effect HttpApi, Durable Objects, D1, Workers AI
│   └── web/           # Vite React UI, ported from the old frontend
├── legacy/
│   ├── klawva-be/     # frozen Python backend. port only
│   └── klawva-fe/     # frozen Next.js frontend. UI reference
├── docs/              # local plans and scratch. not committed
├── spikes/            # throwaway experiments. not committed
├── AGENTS.md          # agent rules for this repo
└── README.md
```

## agent types

| Agent | Role | Channel |
|---|---|---|
| Scrapper | Web intelligence and data | Telegram |
| Researcher | Multi source research reports | Telegram |
| Job Seeker | Finds and ranks job openings | Telegram |
| Lead Scout | Finds and qualifies leads | Telegram |
| Vendor | Handles customer inquiries | WhatsApp, deferred |

## running locally

The new apps are not scaffolded yet. Once they land:

```bash
source ~/.config/klawva/cloudflare.env
pnpm --dir apps/worker dev   # worker on http://127.0.0.1:8787
pnpm --dir apps/web dev      # web on http://localhost:3000
```

## contributing

Private project. Contributions are not accepted.

## license

MIT. See [LICENSE](LICENSE).
