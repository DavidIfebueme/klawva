import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.features.provisioning.inference import resolve_model_policy
from app.main import app


def test_resolve_model_policy_preferred() -> None:
    selected, policy = resolve_model_policy({"openai-gpt-oss-120b", "openai-gpt-oss-20b"})
    assert selected == "openai-gpt-oss-120b"
    assert policy == "preferred"


def test_resolve_model_policy_fallback() -> None:
    selected, policy = resolve_model_policy({"openai-gpt-oss-20b"})
    assert selected == "openai-gpt-oss-20b"
    assert policy == "fallback"


def test_resolve_model_policy_none() -> None:
    with pytest.raises(HTTPException) as exc:
        resolve_model_policy({"llama3.3-70b-instruct"})
    assert exc.value.status_code == 503


def test_inference_models_endpoint(
    test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_discover() -> dict[str, object]:
        return {
            "selectedModel": "openai-gpt-oss-20b",
            "policy": "fallback",
            "models": [
                {"id": "openai-gpt-oss-20b", "owner": "digitalocean"},
            ],
        }

    monkeypatch.setattr(
        "app.features.provisioning.inference_routes.discover_models_and_select",
        fake_discover,
    )

    response = test_client.get("/api/inference/models")
    assert response.status_code == 200
    assert response.json()["selectedModel"] == "openai-gpt-oss-20b"


@pytest.fixture
def test_client() -> TestClient:
    return TestClient(app)
