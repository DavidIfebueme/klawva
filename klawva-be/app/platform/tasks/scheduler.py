import asyncio
import logging

from app.platform.db.session import SessionLocal

log = logging.getLogger(__name__)

_INTERVAL_SECONDS = 300


async def _scheduler_loop() -> None:
    while True:
        await asyncio.sleep(_INTERVAL_SECONDS)
        try:
            from app.features.emails.service import dispatch_due_shift_emails
            from app.features.termination.service import (
                execute_due_terminations,
                process_upcoming_auto_renewals,
            )

            async with SessionLocal() as db:
                await process_upcoming_auto_renewals(db)
                await execute_due_terminations(db)
                sent = await dispatch_due_shift_emails(db)
                log.info(
                    "Scheduler tick: auto-renewals + terminations processed, %d shift emails sent",
                    sent,
                )
        except Exception:
            log.exception("Scheduler tick failed")
