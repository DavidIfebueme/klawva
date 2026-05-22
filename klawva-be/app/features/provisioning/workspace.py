import shutil
from pathlib import Path

from app.features.sessions.models import Session
from app.platform.config import settings

from .agent_config import AGENT_BOOTSTRAP_PROFILE, _agent_gateway_id


def create_agent_workspace(session: Session) -> str:
    profile = AGENT_BOOTSTRAP_PROFILE.get(session.agent_id, {})
    agent_id = _agent_gateway_id(session.id)

    workspace_dir = Path(settings.openclaw_workspaces_dir) / agent_id
    workspace_dir.mkdir(parents=True, exist_ok=True)

    agent_dir = Path(settings.openclaw_agents_dir) / agent_id / "agent"
    agent_dir.mkdir(parents=True, exist_ok=True)

    soul_content = str(profile.get("soul_md", ""))
    brief_payload = session.brief if isinstance(session.brief, dict) else {}
    brief_section = "\n\n## Employer Brief\n"
    for key, value in brief_payload.items():
        brief_section += f"- **{key}**: {value}\n"

    (workspace_dir / "SOUL.md").write_text(soul_content + brief_section, encoding="utf-8")

    return str(workspace_dir)


def delete_agent_workspace(session_id: str) -> bool:
    agent_id = _agent_gateway_id(session_id)

    workspace_dir = Path(settings.openclaw_workspaces_dir) / agent_id
    agent_dir = Path(settings.openclaw_agents_dir) / agent_id

    removed = False
    if workspace_dir.exists():
        shutil.rmtree(workspace_dir, ignore_errors=True)
        removed = True
    if agent_dir.exists():
        shutil.rmtree(agent_dir, ignore_errors=True)
        removed = True

    return removed
