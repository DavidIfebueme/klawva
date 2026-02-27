from fastapi import APIRouter
from pydantic import BaseModel

from app.platform.observability.alerts import evaluate_alerts
from app.platform.observability.metrics import metrics_registry

router = APIRouter(prefix="/api/observability", tags=["observability"])


class MetricResponse(BaseModel):
    name: str
    value: int


class AlertResponse(BaseModel):
    code: str
    severity: str
    message: str


@router.get("/metrics", response_model=list[MetricResponse])
async def metrics_endpoint() -> list[MetricResponse]:
    return [
        MetricResponse(name=item.name, value=item.value)
        for item in metrics_registry.snapshot()
    ]


@router.get("/alerts", response_model=list[AlertResponse])
async def alerts_endpoint() -> list[AlertResponse]:
    alerts = evaluate_alerts(metrics_registry)
    return [AlertResponse(code=a.code, severity=a.severity, message=a.message) for a in alerts]
