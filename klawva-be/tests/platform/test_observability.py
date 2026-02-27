from fastapi.testclient import TestClient

from app.main import app
from app.platform.observability.metrics import metrics_registry


def test_metrics_and_alerts_endpoints() -> None:
    metrics_registry.set("provisioning_failed", 0)
    metrics_registry.set("webhook_failures", 0)
    metrics_registry.set("orphaned_droplets", 0)

    client = TestClient(app)
    client.get("/health")

    metrics_response = client.get("/api/observability/metrics")
    assert metrics_response.status_code == 200
    metrics = metrics_response.json()
    assert any(item["name"] == "requests_total" for item in metrics)

    alerts_response = client.get("/api/observability/alerts")
    assert alerts_response.status_code == 200
    assert alerts_response.json() == []


def test_alert_thresholds() -> None:
    metrics_registry.set("provisioning_failed", 6)
    metrics_registry.set("webhook_failures", 5)
    metrics_registry.set("orphaned_droplets", 1)

    client = TestClient(app)
    response = client.get("/api/observability/alerts")
    assert response.status_code == 200

    codes = {item["code"] for item in response.json()}
    assert "PROVISIONING_FAILURE_SPIKE" in codes
    assert "WEBHOOK_FAILURE_SPIKE" in codes
    assert "ORPHANED_DROPLETS" in codes
