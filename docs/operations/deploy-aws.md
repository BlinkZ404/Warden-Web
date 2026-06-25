# Deploying the worker on AWS

Warden's UI runs fine on Vercel, but the **pipeline engine cannot**. The engine
shells out to `git` and `node`: it clones the linked repo, writes under
`.warden/`, and boots the target app on a free port to replay the failing
request. A Vercel or Lambda function has a read-only filesystem and no `git`, so
the engine needs real compute.

This runbook puts that engine on AWS. The result is an end-to-end AWS stack:
**Aurora** as the system of record and **AWS compute** running the worker, with
**Vercel** kept only as the dashboard/UI. The two halves never call each other
directly; they coordinate through the Aurora job queue (`lib/repo/jobs.ts`, which
already uses `FOR UPDATE SKIP LOCKED` for exactly this multi-host split), so no
application code changes to add the worker.

```
  Sentry / dashboard ──HTTP──> Vercel (Next.js UI)  ──┐
                                                       ├─> Aurora (jobs + state)
  AWS worker (this doc)  ── npm run worker ───────────┘     ▲
        clones repo · runs agents · verifies · opens PR ────┘
```

> Prerequisite: Aurora is provisioned and migrated (see
> [go-live.md](go-live.md) §1). The worker only needs to reach that same
> `DATABASE_URL`.

---

## Which AWS service

| Service | Fit | When to pick it |
|---|---|---|
| **EC2 / Lightsail** (VM) | Fastest to live | The submission. SSH in, run the worker, done in under an hour. |
| **ECS Fargate** (container) | Cleanest, no VM to manage | After the hackathon, or if you want a managed always-on service. |
| App Runner | Awkward | It is HTTP-service shaped; the worker is a poller. Use Fargate instead. |
| Lambda | Does not work | Read-only FS, no `git`, 15-min cap. Same wall as Vercel. |

**Recommendation for the June 29 submission: Lightsail (or EC2).** It is the
shortest path to a genuinely live, all-AWS run, and it means you no longer have
to record the demo locally: the deployed worker drives the pipeline for real.

---

## One decision first: how does the worker reach Aurora?

- **Aurora is publicly accessible (over TLS).** Any compute can connect with the
  vendored RDS CA (`certs/rds-global-bundle.pem`, loaded automatically). Simplest;
  put the worker anywhere.
- **Aurora is private inside a VPC.** The worker must live in the **same VPC**:
  an EC2 instance in a VPC subnet, or a Fargate task in those subnets. Add the
  worker's security group to Aurora's inbound rule on port 5432.

If you are unsure, it is public if its endpoint resolves and you can reach it
from your laptop; otherwise it is VPC-private.

---

## Path A: Lightsail / EC2 (recommended)

Two ways to run it on the box. **A1 (Docker)** is the most reproducible; **A2
(bare)** is the fewest moving parts. Pick one.

1. **Launch an instance.** Lightsail "Linux/Unix" blueprint, or an EC2
   `t3.small` (2 vCPU / 2 GB is comfortable; the agents are network-bound). Ubuntu
   22.04+ / Amazon Linux 2023. Open only SSH (22) inbound; the worker needs no
   inbound ports of its own. If Aurora is VPC-private, launch the instance into
   the **same VPC** and allow it to Aurora on 5432.

2. **Put your secrets in a file** (`/opt/warden/.env`, `chmod 600`):

   ```bash
   WARDEN_MODE=live
   DATABASE_URL=postgres://USER:PASS@your-cluster.cluster-xxxx.us-east-1.rds.amazonaws.com:5432/warden
   # Provider keys (managed billing): the platform pays the model bills.
   ANTHROPIC_API_KEY=sk-ant-...
   OPENAI_API_KEY=sk-...
   GEMINI_API_KEY=AIza...
   CURSOR_API_KEY=crsr-...
   EMBEDDING_API_KEY=sk-...        # optional; falls back to the local embedder
   WARDEN_API_SECRET=<long-random> # so approve/rollback/tick are not world-writable
   # PGSSL_INSECURE=1              # only if you skip CA verification (not recommended)
   ```

   Everything else (linked GitHub repo, GitHub token, `DELIVERY_MODE`, build/run
   commands, per-role model assignments, billing mode) is read from the **settings
   overlay in Aurora** and set through the dashboard, so it does not belong here.

### A1: run the Docker image

```bash
# Install Docker (Ubuntu)
curl -fsSL https://get.docker.com | sh

# Get the code and build the worker image
git clone https://github.com/BlinkZ404/Warden-Web.git /opt/warden/src
cd /opt/warden/src
docker build -t warden-worker .

# Run it, restart on reboot/crash, secrets from the env file
docker run -d --name warden-worker --restart unless-stopped \
  --env-file /opt/warden/.env \
  warden-worker
```

Logs: `docker logs -f warden-worker`. Update: `git pull && docker build -t
warden-worker . && docker rm -f warden-worker && docker run -d ...`.

### A2: run it bare under systemd

```bash
# Node 24 + git
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs git

git clone https://github.com/BlinkZ404/Warden-Web.git /opt/warden/src
cd /opt/warden/src && npm ci
```

Create `/etc/systemd/system/warden-worker.service`:

```ini
[Unit]
Description=Warden orchestrator worker
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=/opt/warden/src
EnvironmentFile=/opt/warden/.env
ExecStart=/usr/bin/npm run worker
Restart=always
RestartSec=5
# SIGTERM drains the DB pool cleanly (worker.ts handles it).
KillSignal=SIGTERM
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now warden-worker
journalctl -u warden-worker -f
```

---

## Path B: ECS Fargate (managed, post-hackathon)

1. **Push the image to ECR.**

   ```bash
   aws ecr create-repository --repository-name warden-worker
   aws ecr get-login-password | docker login --username AWS --password-stdin \
     <acct>.dkr.ecr.<region>.amazonaws.com
   docker build -t warden-worker .
   docker tag warden-worker <acct>.dkr.ecr.<region>.amazonaws.com/warden-worker:latest
   docker push <acct>.dkr.ecr.<region>.amazonaws.com/warden-worker:latest
   ```

2. **Store secrets** in AWS Secrets Manager (or SSM Parameter Store): one secret
   per key from the `.env` above. The task definition references them with
   `secrets:` so they are injected at runtime, never baked into the image.

3. **Task definition.** Fargate, 0.5 vCPU / 1 GB to start, the ECR image,
   `secrets` wired to your Secrets Manager entries, and `WARDEN_MODE=live` plus
   `NODE_ENV=production` as plain `environment`. CloudWatch Logs for the log group.

4. **Service.** Run it as a service with **desired count 1 and no load balancer**
   (the worker has no inbound port; it polls). If Aurora is VPC-private, put the
   service in Aurora's VPC/subnets and let its security group reach 5432. ECS
   restarts the task if it dies.

`stopTimeout` of ~20s lets the worker handle `SIGTERM` and close the pool cleanly.

---

## Verify it is actually working

1. **It is alive.** `docker logs` / `journalctl` shows
   `[worker] polling for jobs every 2s`.
2. **It reaches Aurora.** No `ECONNREFUSED` / TLS errors in the logs. A quick
   `npm run migrate` from the box (or any host with the same `DATABASE_URL`)
   should print `applied 0 new` against a migrated cluster.
3. **It drains the queue end to end.** In the dashboard, link a repo + GitHub
   token (Settings) and fire a real incident. The worker should pick it up within
   ~2s and march it through investigate -> fix -> review -> verify, ending in a
   pull request on your repo. Watch the audit log advance with no manual ticks.

If incidents sit in `detected` and never move, the worker is not connected to the
same Aurora the UI writes to: re-check `DATABASE_URL` matches the dashboard's.

---

## Notes

- **Target apps with native modules.** The worker boots the *linked* repo to
  replay requests. If that repo compiles native deps, add `build-essential python3`
  to the Dockerfile's `apt-get` line (the bundled sample app is zero-dep, so the
  default image is enough for the demo).
- **Managed billing.** With the provider keys in the worker's env and
  `BILLING_MODE=managed`, the platform pays the model bills and meters each fix
  from the prepaid wallet, so founders never paste an API key.
- **The Vercel cron stays.** `vercel.json`'s daily GET of `/api/orchestrator/tick`
  is a safety-net that re-drains stuck jobs; the AWS worker is the real driver.
  Set `CRON_SECRET` so the tick is not callable by anyone.
