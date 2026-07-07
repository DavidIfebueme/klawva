# System Architecture

Klawva is structured as an AI worker orchestration platform, decoupling user-facing dashboard interfaces, autonomous AI agent execution spaces, and a robust payment and reconciliation system.

---

## 1. High-Level Orchestration Flow

The system flows sequentially from onboarding to autonomous agent execution and reporting:

```
[ Employer ] --(Hire & Brief)--> [ Next.js Dashboard ] 
                                          │
                                   (Provision API)
                                          ▼
                                   [ FastAPI BE ] --(Register Account/Wallet)--> [ Database ]
                                          │
                            (Spin Up Isolated Workspace)
                                          ▼
                               [ OpenClaw AI Gateway ]
                                          │
                              (Telegram / WhatsApp Deep Link)
                                          ▼
                                 [ Active AI Agent ]
```

---

## 2. Payment Infrastructure Architecture

Klawva features a centralized billing and wallet model integrated with payment gateways to support autonomous operation:

```
                  ┌─────────────────────────────────┐
                  │          Employer Wallet        │
                  └────────────────┬────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
       ┌─────────────────────────┐   ┌─────────────────────────┐
       │   Checkout Deposits     │   │   Virtual Account (VA)  │
       │  (Nomba & Stripe APIs)  │   │     (Persistent NGN)    │
       └─────────────────────────┘   └─────────────────────────┘
```

### Why Virtual Account Funding Instead of a Subscription Engine?

Klawva purposefully implements a **Virtual Account (VA) Wallet Funding** architecture rather than a standard SaaS subscription engine:

> **Core Architectural Decision**: 
> 
> 1. **Autonomous Agent Delegated Spending (Future-Proofing)**:
>    A standard subscription model only pays for agent runtime. In future updates, AI agents will act as autonomous proxies—performing actions on behalf of the user, such as purchasing goods, procuring materials, or subscribing to necessary third-party APIs. To do this, agents require direct access to a funded, persistent account balance belonging to their employer.
> 
> 2. **User Convenience & Persistent Top-Ups**:
>    Instead of forcing users to generate temporary accounts or run through checkout screens repeatedly to extend shifts, Klawva allocates a permanent bank virtual account mapped directly to the employer's wallet. Users can save this bank account in their banking app and top up their Klawva balance dynamically at any time via standard bank transfers.

---

## 3. Webhook Reconciliation & Reversal Engine

To guarantee transactional consistency, the backend implements an automated check-and-reversal processor for incoming webhooks:

* **Signature Verification**: Validates Nomba/Stripe webhooks by computing body-based HMAC-SHA256 digests (Hex & Base64) alongside colon-separated header verification.
* **Underpayment & Minimum Checks**: 
  * Checkout payments that fail to meet the expected minor amount are marked as `reversed`.
  * Virtual account funding transactions below the minimum threshold (₦5,000) are blocked.
  * In both cases, the system extracts the customer's bank details from the webhook payload and triggers an automatic refund/payout reversal via Nomba's payout API.
* **Wallet Transparency Logging**: Every reversal records two ledger entries in the `wallet_transactions` table for auditing:
  1. An incoming credit transaction (recording the deposit attempt).
  2. An outgoing debit transaction (recording the automatic refund/reversal).
* **Idempotency & Failed Reconciliation Queue**: Webhook processing is protected by an idempotency registry. Unmatched reference events are automatically queued for background retry, or manual linking by admins.

---

## 4. Application & Deployment Infrastructure

Beyond the payment layer, Klawva relies on a highly decoupled operational infrastructure:

### A. AI Gateway Integration (OpenClaw)
Klawva does not run agent loops inside the main web server. Instead, it interfaces with **OpenClaw**, an isolated AI execution gateway:
- **On-Demand Provisioning**: When a shift is funded, the backend makes an API call to OpenClaw to provision a brand-new containerized agent workspace.
- **Workspace Isolation**: Each workspace has its own configuration files, access policies, specific tool manifests (strictly blocking system shell commands), and environment variables.

### B. Observability & Background Tasks
- **FastAPI Background Tasks**: Handles lightweight asynchronous operations like logging and auditing.
- **Observed Scheduler**: A persistent background task runner checks database sessions periodically to:
  * Dispatch shift-ending-soon emails.
  * Automate auto-renewals using remaining wallet balances.
  * Automatically clean up expired provisioning blocks.
  * Process due reversals and retry failed reconciliation queues.

### C. Persistent Data & Caching Layers
- **Relational Database (PostgreSQL)**: Serves as the source of truth for user models, wallets, transactions, sessions, payments, and active channels. Checked and updated safely via **Alembic** migrations.

### D. Production Deployment Architecture
- **Linode VM**: Hosts the backend service, Postgres DB, and OpenClaw engine.
- **Nginx Reverse Proxy**: Manages SSL termination (Let's Encrypt), logs request headers, and acts as a gateway proxy mapping external traffic to the FastAPI Uvicorn process (port 9000).
- **Systemd Services**: Manages the lifecycles of the FastAPI application (`klawva-backend.service`) and scheduler task runners.
- **Vercel Deployments**: Serves the Next.js frontend UI (`klawva-fe`), connecting securely to the backend REST API endpoints.
