from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.reports.contracts import MissionReportResponse, UpsertMissionReportRequest
from app.features.reports.service import get_mission_report, upsert_mission_report
from app.features.sessions.auth import assert_session_access, get_session_token_header
from app.platform.db.session import get_async_session

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.post("/upsert", response_model=MissionReportResponse)
async def upsert_mission_report_endpoint(
    payload: UpsertMissionReportRequest,
    db: AsyncSession = Depends(get_async_session),
) -> MissionReportResponse:
    report = await upsert_mission_report(
        db,
        session_id=payload.session_id,
        summary=payload.summary,
        report_data=payload.report_data,
        report_card_url=payload.report_card_url,
    )
    return MissionReportResponse(
        sessionId=report.session_id,
        summary=report.summary,
        reportData=report.report_data,
        reportCardUrl=report.report_card_url,
        deliveredAt=report.delivered_at,
    )


@router.get("/{session_id}", response_model=MissionReportResponse)
async def get_mission_report_endpoint(
    session_id: str,
    session_token: str = Depends(get_session_token_header),
    db: AsyncSession = Depends(get_async_session),
) -> MissionReportResponse:
    await assert_session_access(
        db,
        session_id=session_id,
        session_token=session_token,
    )
    report = await get_mission_report(db, session_id=session_id)
    return MissionReportResponse(
        sessionId=report.session_id,
        summary=report.summary,
        reportData=report.report_data,
        reportCardUrl=report.report_card_url,
        deliveredAt=report.delivered_at,
    )
