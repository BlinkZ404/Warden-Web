#!/usr/bin/env bash
#
# Arm the worker's pull-based auto-deployer: a systemd timer that checks GitHub
# every 60s and, when main has moved, pulls and restarts the worker. The worker
# pulls outbound, so this needs no inbound SSH, no security-group edits, and is
# immune to a rotating client IP.
#
# Prerequisites (one-time, already done on this box):
#   - git credentials cached:  git config --global credential.helper store  (+ one pull)
#   - passwordless restart:     /etc/sudoers.d/warden-deploy  (mode 0440)
#
# Run once, as root:  sudo bash scripts/setup-auto-deploy.sh
set -euo pipefail

REPO=/opt/warden/src
WORKER=warden-worker

cat > /opt/warden/auto-deploy.sh <<'SCRIPT'
#!/usr/bin/env bash
# Pull main and restart the worker only when a new commit has landed.
cd /opt/warden/src || exit 0
git fetch origin main --quiet || exit 0
local_sha=$(git rev-parse HEAD)
remote_sha=$(git rev-parse origin/main)
[ "$local_sha" = "$remote_sha" ] && exit 0
echo "deploying $local_sha -> $remote_sha"
git pull --ff-only --quiet || exit 1
# reinstall dependencies only when the lockfile actually changed
git diff --quiet "$local_sha" "$remote_sha" -- package-lock.json package.json || npm install --silent
/usr/bin/sudo /usr/bin/systemctl restart warden-worker
SCRIPT
chmod +x /opt/warden/auto-deploy.sh
chown ec2-user:ec2-user /opt/warden/auto-deploy.sh

cat > /etc/systemd/system/warden-deploy.service <<'UNIT'
[Unit]
Description=Warden auto-deploy (pull + restart on new commit)

[Service]
Type=oneshot
User=ec2-user
Environment=HOME=/home/ec2-user
ExecStart=/opt/warden/auto-deploy.sh
UNIT

cat > /etc/systemd/system/warden-deploy.timer <<'UNIT'
[Unit]
Description=Run Warden auto-deploy every 60s

[Timer]
OnBootSec=60
OnUnitActiveSec=60

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now warden-deploy.timer

echo "=== auto-deploy armed ==="
systemctl list-timers warden-deploy.timer --no-pager || true
