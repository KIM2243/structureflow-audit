#!/usr/bin/env bash
set -euo pipefail
# Run with sudo from the uploaded staging directory on the existing Oracle VM.
test "$(id -u)" -eq 0
test -d /opt/structureflow-bridge
test -f /etc/structureflow/bridge.env
test -x /opt/node-v22.23.2-linux-x64/bin/node
test -f ./lib/kiwoom.ts
test -f ./scripts/kiwoom-bridge.mjs
test -f ./scripts/auto-paper-runner.mjs
backup_dir="/opt/structureflow-bridge/backup-auto-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 700 "$backup_dir"
cp -p /opt/structureflow-bridge/lib/kiwoom.ts "$backup_dir/kiwoom.ts"
cp -p /opt/structureflow-bridge/scripts/kiwoom-bridge.mjs "$backup_dir/kiwoom-bridge.mjs"
install -m 644 ./lib/kiwoom.ts /opt/structureflow-bridge/lib/kiwoom.ts
install -m 644 ./scripts/kiwoom-bridge.mjs /opt/structureflow-bridge/scripts/kiwoom-bridge.mjs
install -m 644 ./scripts/auto-paper-runner.mjs /opt/structureflow-bridge/scripts/auto-paper-runner.mjs
systemctl restart structureflow-bridge
if ! curl --retry 4 --retry-delay 1 --retry-connrefused --fail --silent http://127.0.0.1:8790/health; then
  cp -p "$backup_dir/kiwoom.ts" /opt/structureflow-bridge/lib/kiwoom.ts
  cp -p "$backup_dir/kiwoom-bridge.mjs" /opt/structureflow-bridge/scripts/kiwoom-bridge.mjs
  systemctl restart structureflow-bridge
  exit 1
fi
cat > /etc/systemd/system/structureflow-auto-paper.service <<'UNIT'
[Unit]
Description=StructureFlow paper-only strategy scheduler
Wants=network-online.target
After=network-online.target structureflow-bridge.service
[Service]
Type=simple
User=structureflow
Group=structureflow
WorkingDirectory=/opt/structureflow-bridge
EnvironmentFile=/etc/structureflow/bridge.env
Environment=STRUCTUREFLOW_SITE_URL=https://structureflow.tpfresh.com
ExecStart=/opt/node-v22.23.2-linux-x64/bin/node /opt/structureflow-bridge/scripts/auto-paper-runner.mjs
Restart=on-failure
RestartSec=10
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
CapabilityBoundingSet=
UMask=0077
MemoryMax=160M
TasksMax=32
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemd-analyze verify /etc/systemd/system/structureflow-auto-paper.service
systemctl enable --now structureflow-auto-paper.service
systemctl is-active structureflow-auto-paper.service structureflow-bridge.service
