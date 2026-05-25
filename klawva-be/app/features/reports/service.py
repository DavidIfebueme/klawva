import secrets
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.reports.models import MissionReport
from app.features.sessions.models import Session


def _generate_share_token() -> str:
    return secrets.token_urlsafe(32)


async def upsert_mission_report(
    db: AsyncSession,
    *,
    session_id: str,
    summary: str,
    report_data: dict,
    report_card_url: str | None,
) -> MissionReport:
    session = await db.get(Session, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session_not_found")

    statement = select(MissionReport).where(MissionReport.session_id == session_id)
    result = await db.execute(statement)
    report = result.scalar_one_or_none()

    if report is None:
        report = MissionReport(
            session_id=session_id,
            summary=summary,
            report_data=report_data,
            report_card_url=report_card_url,
            share_token=_generate_share_token(),
            delivered_at=datetime.now(UTC),
        )
        db.add(report)
    else:
        report.summary = summary
        report.report_data = report_data
        report.report_card_url = report_card_url
        report.delivered_at = datetime.now(UTC)

    await db.commit()
    await db.refresh(report)
    return report


async def get_mission_report(db: AsyncSession, *, session_id: str) -> MissionReport:
    statement = select(MissionReport).where(MissionReport.session_id == session_id)
    result = await db.execute(statement)
    report = result.scalar_one_or_none()
    if report is None:
        raise HTTPException(status_code=404, detail="mission_report_not_found")
    return report
