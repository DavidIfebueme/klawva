# legacy

The pre-Cloudflare klawva. Kept for reference and for porting logic. Not built on, not imported from.

- `klawva-be` is the dead Python backend. FastAPI, SQLAlchemy, Postgres, Alembic, an asyncio scheduler, and a client for a self-hosted openclaw gateway. The server is gone.
- `klawva-fe` is the old Next.js frontend. The UI is the source of truth for the port. Every Tailwind class, component, and animation is preserved where possible.

The plan for the migration lives in `docs/revival-plan.md`, which is local and not committed. The new stack lands under `apps/worker` and `apps/web`.

Port from here. Do not extend here.
