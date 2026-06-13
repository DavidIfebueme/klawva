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
    worker_name = str(brief_payload.get("workerName", session.agent_id))
    employer_name = session.customer_email or "Employer"

    brief_section = "\n\n## Employer Brief\n"
    for key, value in brief_payload.items():
        brief_section += f"- **{key}**: {value}\n"

    (workspace_dir / "SOUL.md").write_text(soul_content + brief_section, encoding="utf-8")

    identity_lines = [
        "# IDENTITY.md",
        "",
        f"- **Name:** {worker_name}",
        f"- **Creature:** Klawva {session.agent_id.capitalize()} — an AI specialist agent",
        "- **Vibe:** Professional, concise, task-focused",
        "- **Emoji:** ⚡",
    ]
    (workspace_dir / "IDENTITY.md").write_text("\n".join(identity_lines) + "\n", encoding="utf-8")

    user_lines = [
        "# USER.md — Your Employer",
        "",
        f"- **Name:** {employer_name}",
        "- **What to call them:** Employer",
        "- **Timezone:** UTC",
        f"- **Notes:** Klawva {session.agent_id} session. "
        "Read SOUL.md for your full identity and instructions.",
    ]
    (workspace_dir / "USER.md").write_text("\n".join(user_lines) + "\n", encoding="utf-8")

    bootstrap_path = workspace_dir / "BOOTSTRAP.md"
    if bootstrap_path.exists():
        bootstrap_path.unlink()

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
