#!/usr/bin/python3
"""Recover a stalled existing tunnel; never reboot or restart the trading engine."""
import json
import subprocess
import time
import urllib.request
from pathlib import Path


def decision(state, healthy, now):
    failures = 0 if healthy else min(int(state.get('failures', 0)) + 1, 3)
    last_restart = float(state.get('last_restart', 0))
    restart = failures >= 3 and now - last_restart >= 600
    return {'failures': failures, 'last_restart': now if restart else last_restart}, restart


def main():
    state_file = Path('/var/lib/structureflow-tunnel-health/state.json')
    try:
        state = json.loads(state_file.read_text())
    except (OSError, ValueError):
        state = {}
    try:
        with urllib.request.urlopen('http://127.0.0.1:20241/ready', timeout=5) as response:
            healthy = response.status == 200 and json.load(response).get('readyConnections', 0) > 0
    except Exception:
        healthy = False
    state, restart = decision(state, healthy, time.time())
    state_file.write_text(json.dumps(state))
    if restart:
        print('Tunnel unhealthy on 3 checks; restarting tunnel service only', flush=True)
        subprocess.run(['systemctl', 'restart', 'structureflow-tunnel.service'], check=True, timeout=45)
    elif not healthy:
        print('Tunnel readiness failure', state['failures'], flush=True)


if __name__ == '__main__':
    main()
