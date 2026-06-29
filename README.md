# klawva

<p align="center">
  <strong>hire autonomous ai workers. manage them from one dashboard.</strong>
</p>

<p align="center">
  <a href="https://klawva.xyz">website</a> · <a href="https://klawva.xyz/dashboard">dashboard</a> · <a href="#how-it-works">how it works</a> · <a href="#api">api</a> · <a href="#deployment">deployment</a>
</p>

---

**klawva** is an ai employee-as-a-service platform. employers hire ai agents that work on telegram, whatsapp, and other channels. each agent has a soul, a brief, and a shift — just like a real employee.

you hire a worker. it shows up. it does the job. you get a report.

## how it works

1. **hire** — employer picks an agent type and fills out a brief
2. **provision** — klawva spins up an isolated openclaw agent with its own workspace, soul, and tools
3. **connect** — agent connects to telegram (or whatsapp, slack, etc.) via a deep link
4. **work** — employer messages the agent directly. it handles tasks autonomously
5. **report** — at shift end, klawva generates a mission report with summary and stats

auto-renewal keeps shifts running. wallets handle billing. the dashboard tracks everything.

## tech stack

| layer | technology |
|-------|-----------|
| **backend** | python · fastapi · sqlalchemy · alembic · postgresql |
| **ai gateway** | [openclaw](https://github.com/openclaw/openclaw) |
| **frontend** | next.js · react · tailwind css · vercel |
| **payments** | naira (nomba) · stripe (international) |
| **email** | brevo smtp api |
| **infrastructure** | linode · nginx · systemd · github actions ci/cd |

## project structure

```
klawva/
├── klawva-be/                  # fastapi backend
│   ├── app/
│   │   ├── features/
│   │   │   ├── channels/       # telegram, whatsapp, slack channel management
│   │   │   ├── dashboard/      # employer dashboard api + auth
│   │   │   ├── emails/         # email events + dispatch
│   │   │   ├── history/        # session history + magic links
│   │   │   ├── payments/       # wallets, billing, nomba/stripe
│   │   │   ├── provisioning/   # agent provisioning + workspace setup
│   │   │   ├── reports/        # mission reports + share tokens
│   │   │   ├── sessions/       # session lifecycle + activation
│   │   │   ├── termination/    # shift termination + auto-renewal
│   │   │   └── users/          # user model
│   │   └── platform/
│   │       ├── clients/        # openclaw gateway client
│   │       ├── config/         # settings + env
│   │       ├── db/             # database engine + sessions
│   │       ├── email/          # brevo email service
│   │       ├── http/           # fastapi app + middleware
│   │       ├── logging/        # structured logging
│   │       ├── observability/  # health + metrics
│   │       ├── security/       # rate limiting + auth middleware
│   │       └── tasks/          # background scheduler
│   ├── alembic/                # database migrations
│   └── pyproject.toml
├── klawva-fe/                  # next.js frontend
│   ├── app/
│   │   ├── checkout/           # hire flow + payment
│   │   ├── dashboard/          # employer dashboard
│   │   ├── session/            # session status + live view
│   │   └── report/             # mission report viewer
│   ├── components/
│   └── lib/
├── .github/workflows/          # ci/cd (auto-deploy on push)
└── scripts/                    # deployment + cleanup scripts
```

## getting started

### prerequisites

- python 3.12+
- node.js 18+
- postgresql 16+
- redis (optional, for caching)
- an [openclaw](https://github.com/openclaw/openclaw) gateway running
- a telegram bot token (from [@botfather](https://t.me/botfather))

### backend

```bash
cd klawva-be

# install dependencies
uv sync

# set up environment
cp .env.example .env
# edit .env with your database url, openclaw gateway url, telegram tokens, etc.

# run migrations
alembic upgrade head

# start the server
uvicorn app.platform.http.app:create_app --factory --reload
```

the api runs at `http://localhost:9000` by default.

### frontend

```bash
cd klawva-fe

# install dependencies
npm install

# set up environment
cp .env.local.example .env.local
# edit .env.local with your backend api url

# start development server
npm run dev
```

the frontend runs at `http://localhost:3000`.

## api

### core endpoints

| method | endpoint | description |
|--------|----------|-------------|
| `POST` | `/api/sessions/{id}/activate` | provision and start a session |
| `GET` | `/api/sessions/{id}/status` | check session + channel connection status |
| `POST` | `/api/sessions/{id}/deactivate` | terminate a session |
| `GET` | `/api/channels/link` | get deep link for employer to connect |
| `POST` | `/api/channels/lock` | lock channel to specific user |
| `GET` | `/api/reports/{id}` | get mission report |
| `GET` | `/api/reports/{id}/share/{token}` | public shareable report link |

### dashboard endpoints

| method | endpoint | description |
|--------|----------|-------------|
| `POST` | `/api/dashboard/auth/request-magic-link` | request login magic link |
| `POST` | `/api/dashboard/auth/verify` | verify magic link token |
| `GET` | `/api/dashboard/sessions` | list employer's sessions |
| `GET` | `/api/dashboard/wallet` | get wallet balance |

### admin endpoints

| method | endpoint | description |
|--------|----------|-------------|
| `POST` | `/api/termination/execute-due` | process due terminations |
| `POST` | `/api/emails/dispatch-due` | send shift-ending-soon emails |

## deployment

the project uses github actions for ci/cd. pushing to `master` triggers an auto-deploy to the production server.

```bash
# manual deploy
ssh root@<server-ip> "klawva-deploy"

# cleanup (archive sessions, free bot tokens)
ssh root@<server-ip> "klawva-clean"
```

### environment variables

key variables (see `.env.example` for full list):

```
# database
DATABASE_URL=postgresql+asyncpg://...

# openclaw
OPENCLAW_GATEWAY_URL=http://localhost:9090
OPENCLAW_GATEWAY_TOKEN=...

# telegram bot pool (comma-separated)
TELEGRAM_BOT_TOKEN_POOL=token1,token2,token3,...

# email (brevo)
BREVO_API_KEY=...
BREVO_SENDER_EMAIL=...
BREVO_SENDER_NAME=Klawva

# payments
NOMBA_CLIENT_ID=...
NOMBA_CLIENT_SECRET=...
STRIPE_SECRET_KEY=...

# ai model
DEFAULT_MODEL=google/gemini-2.5-flash
```

## how agents work

each klawva agent is an isolated [openclaw](https://github.com/openclaw/openclaw) instance with:

- **soul** — identity and behavior instructions (from `SOUL.md`)
- **brief** — employer-specific task details
- **tools** — minimal tool profile (no system commands exposed)
- **workspace** — isolated directory with soul, identity, and user files
- **channel** — telegram deep link for direct employer communication

agents are provisioned on-demand when an employer hires a worker, and terminated when the shift ends.

## contributing

this is a private project. contributions are not currently accepted.

## license

mit license. see [LICENSE](LICENSE) for details.
