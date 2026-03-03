import json

from app.features.channels.models import ChannelLink
from app.features.sessions.models import Session
from app.platform.config import settings

AGENT_BOOTSTRAP_PROFILE: dict[str, dict[str, object]] = {
    "scrapper": {
        "system_profile": "scrapper_v1",
        "tools": ["browser", "parser", "exporter"],
    },
    "vendor": {
        "system_profile": "vendor_v1",
        "tools": ["whatsapp_gateway", "faq_lookup", "order_tracker"],
    },
    "researcher": {
        "system_profile": "researcher_v1",
        "tools": ["search", "pdf_reader", "report_writer"],
    },
}


def build_session_config(session: Session, channel_link: ChannelLink | None) -> dict:
    profile = AGENT_BOOTSTRAP_PROFILE.get(session.agent_id, {})
    brief_payload = session.brief if isinstance(session.brief, dict) else {}

    channel_block: dict[str, object] = {"type": session.channel}
    if channel_link is not None:
        channel_block["bot_token"] = channel_link.external_id
        channel_block["qr_payload"] = channel_link.qr_payload
        channel_block["deep_link"] = channel_link.link_target

    return {
        "session_id": session.id,
        "agent_id": session.agent_id,
        "agent_profile": profile,
        "channel": channel_block,
        "brief": brief_payload,
        "session_window": {
            "started_at": session.started_at.isoformat() if session.started_at else None,
            "expires_at": session.expires_at.isoformat() if session.expires_at else None,
            "duration_hours": 24,
        },
        "callbacks": {
            "base_url": settings.frontend_api_base_url,
            "internal_token": settings.internal_service_token,
            "endpoints": {
                "link_confirmed": "/api/channels/onboarding/link-confirmed",
                "intro_delivered": "/api/channels/onboarding/intro-delivered",
                "activity": "/api/sessions/{session_id}/activity",
            },
        },
        "inference": {
            "provider": "gradient",
            "base_url": settings.gradient_base_url,
            "access_key": settings.gradient_model_access_key,
            "preferred_model": settings.gradient_preferred_model,
            "fallback_model": settings.gradient_fallback_model,
        },
        "onboarding": {
            "intro_message": (
                "Your Klawva session is live. "
                "I am starting your mission now and will send updates here."
            ),
            "welcome_required": True,
            "final_report_delivery": "end_of_shift",
            "termination_behavior": "auto_terminate_after_report",
        },
    }


def build_user_data_script(session_config: dict, gateway_port: int) -> str:
    config_json = json.dumps(session_config, indent=2, default=str)
    session_id = session_config["session_id"]
    internal_token = session_config.get("callbacks", {}).get("internal_token", "")

    return f"""#!/bin/bash
set -euo pipefail

mkdir -p /etc/openclaw/sessions

cat > /etc/openclaw/sessions/{session_id}.json << 'KLAWVA_CONFIG_EOF'
{config_json}
KLAWVA_CONFIG_EOF

chmod 600 /etc/openclaw/sessions/{session_id}.json

echo '{internal_token}' > /etc/openclaw/gateway_token
chmod 600 /etc/openclaw/gateway_token

echo '{gateway_port}' > /etc/openclaw/gateway_port

systemctl restart openclaw-gateway || true
systemctl restart openclaw-agent || true
"""
