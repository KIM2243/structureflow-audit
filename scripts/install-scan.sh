#!/bin/bash
set -euo pipefail
test "$(id -u)" -eq 0
node=/opt/node-v22.23.2-linux-x64/bin/node
base=/opt/structureflow-bridge
backup="$base/backup-scan-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 700 "$backup"
cp -p "$base/lib/kiwoom.ts" "$backup/kiwoom.ts"
cp -p "$base/scripts/kiwoom-bridge.mjs" "$backup/kiwoom-bridge.mjs"
for name in kiwoom.ts scan-policy.mjs scan-evaluate.ts engine.ts market-structure.ts multi-timeframe.ts trade-plan.ts auto-paper.ts; do install -m 644 "lib/$name" "$base/lib/$name"; done
for name in kiwoom-bridge.mjs scan-runner.mjs; do install -m 644 "scripts/$name" "$base/scripts/$name"; done
"$node" --experimental-strip-types --check "$base/lib/kiwoom.ts"
"$node" --check "$base/scripts/scan-runner.mjs"
install -d -o structureflow -g structureflow -m 750 /var/lib/structureflow-scan
cat > /etc/systemd/system/structureflow-scan.service <<'UNIT'
[Unit]
Description=StructureFlow bounded after-close candidate report
After=network-online.target structureflow-bridge.service
Wants=network-online.target
[Service]
Type=oneshot
User=structureflow
Group=structureflow
WorkingDirectory=/opt/structureflow-bridge
EnvironmentFile=/etc/structureflow/bridge.env
ExecStart=/opt/node-v22.23.2-linux-x64/bin/node --max-old-space-size=64 --experimental-strip-types /opt/structureflow-bridge/scripts/scan-runner.mjs
TimeoutStartSec=900
CPUQuota=10%
CPUWeight=1
Nice=19
MemoryHigh=80M
MemoryMax=96M
MemorySwapMax=0
TasksMax=16
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/structureflow-scan
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
CapabilityBoundingSet=
UMask=0027
UNIT
cat > /etc/systemd/system/structureflow-scan.timer <<'UNIT'
[Unit]
Description=Check local exchange close without continuous scanner process
[Timer]
OnCalendar=*-*-* *:00/10:00
AccuracySec=30s
Unit=structureflow-scan.service
[Install]
WantedBy=timers.target
UNIT
systemd-analyze verify /etc/systemd/system/structureflow-scan.service /etc/systemd/system/structureflow-scan.timer
systemctl daemon-reload
systemctl restart structureflow-bridge
if ! curl --retry 5 --retry-delay 1 --retry-connrefused --fail --silent http://127.0.0.1:8790/health; then
 cp -p "$backup/kiwoom.ts" "$base/lib/kiwoom.ts"
 cp -p "$backup/kiwoom-bridge.mjs" "$base/scripts/kiwoom-bridge.mjs"
 systemctl restart structureflow-bridge
 exit 1
fi
systemctl enable --now structureflow-scan.timer
systemctl show structureflow-scan.service -p MemoryMax -p CPUQuotaPerSecUSec -p TimeoutStartUSec
