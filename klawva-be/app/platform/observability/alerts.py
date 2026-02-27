from dataclasses import dataclass

from app.platform.observability.metrics import MetricsRegistry


@dataclass
class AlertItem:
    code: str
    severity: str
    message: str


def evaluate_alerts(registry: MetricsRegistry) -> list[AlertItem]:
    values = {point.name: point.value for point in registry.snapshot()}
    alerts: list[AlertItem] = []

    if values.get("provisioning_failed", 0) >= 5:
        alerts.append(
            AlertItem(
                code="PROVISIONING_FAILURE_SPIKE",
                severity="high",
                message="Provisioning failures reached threshold",
            )
        )

    if values.get("webhook_failures", 0) >= 5:
        alerts.append(
            AlertItem(
                code="WEBHOOK_FAILURE_SPIKE",
                severity="high",
                message="Webhook failures reached threshold",
            )
        )

    if values.get("orphaned_droplets", 0) >= 1:
        alerts.append(
            AlertItem(
                code="ORPHANED_DROPLETS",
                severity="medium",
                message="Detected orphaned droplets",
            )
        )

    return alerts
