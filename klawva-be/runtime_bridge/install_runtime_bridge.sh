#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${1:-$PWD/runtime_bridge}"
INSTALL_DIR="/opt/klawva-runtime-bridge"
PYTHON_BIN="${PYTHON_BIN:-python3}"

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "source_directory_not_found:$SOURCE_DIR"
  exit 1
fi

mkdir -p "$INSTALL_DIR/runtime_bridge"
cp -R "$SOURCE_DIR"/* "$INSTALL_DIR/runtime_bridge/"

"$PYTHON_BIN" -m venv "$INSTALL_DIR/.venv"
"$INSTALL_DIR/.venv/bin/pip" install --upgrade pip
"$INSTALL_DIR/.venv/bin/pip" install fastapi uvicorn pydantic-settings httpx

cat > /etc/systemd/system/klawva-runtime-bridge.service << 'KLAWVA_RUNTIME_BRIDGE_UNIT_EOF'
[Unit]
Description=Klawva Runtime Bridge
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/klawva-runtime-bridge
EnvironmentFile=-/etc/openclaw/runtime-bridge.env
ExecStart=/bin/sh -lc '/opt/klawva-runtime-bridge/.venv/bin/uvicorn runtime_bridge.main:app --host 0.0.0.0 --port ${BRIDGE_GATEWAY_PORT:-9090}'
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
KLAWVA_RUNTIME_BRIDGE_UNIT_EOF

systemctl daemon-reload
systemctl enable klawva-runtime-bridge
systemctl restart klawva-runtime-bridge
systemctl status klawva-runtime-bridge --no-pager -l
