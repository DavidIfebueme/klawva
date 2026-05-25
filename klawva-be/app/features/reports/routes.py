from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.reports.contracts import MissionReportResponse, UpsertMissionReportRequest
from app.features.reports.models import MissionReport
from app.features.reports.service import get_mission_report, upsert_mission_report
from app.features.sessions.auth import assert_session_access, get_session_token_header
from app.platform.db.session import get_async_session

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _to_response(report: MissionReport) -> MissionReportResponse:
    return MissionReportResponse(
        sessionId=report.session_id,
        summary=report.summary,
        reportData=report.report_data,
        reportCardUrl=report.report_card_url,
        shareToken=report.share_token,
        deliveredAt=report.delivered_at,
    )


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
    return _to_response(report)


@router.get("/shared/{session_id}", response_model=MissionReportResponse)
async def get_shared_mission_report_endpoint(
    session_id: str,
    shareToken: str = Query(..., alias="shareToken"),
    db: AsyncSession = Depends(get_async_session),
) -> MissionReportResponse:
    statement = select(MissionReport).where(MissionReport.session_id == session_id)
    result = await db.execute(statement)
    report = result.scalar_one_or_none()
    if report is None or report.share_token != shareToken:
        raise HTTPException(status_code=404, detail="report_not_found")
    return _to_response(report)


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
    return _to_response(report)
