# Warden orchestrator worker.
#
# The pipeline shells out to `git` and `node`: it clones the linked repo, writes
# under .warden/, and boots the target app on a free port to replay the failing
# request. It therefore needs a real writable filesystem and the git binary, so
# it cannot run on Lambda or a Vercel function. This image runs on ECS Fargate
# or any VM (EC2 / Lightsail) via Docker. See docs/operations/deploy-aws.md.
FROM node:24-bookworm-slim

# git: clone the linked repo and read its history.
# ca-certificates: TLS to Aurora (the RDS CA bundle is vendored under certs/).
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Run as the image's unprivileged `node` user, not root: the worker clones and
# boots untrusted target-app code, so it must not hold root. /app is owned by
# node so the per-incident workspaces under .warden/ are writable at runtime.
WORKDIR /app
RUN chown node:node /app
USER node

# Install dependencies first so the layer caches across source-only changes. This
# stays before NODE_ENV=production so devDependencies (notably tsx, which the
# worker runs through) are installed, not omitted.
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci

# Application source. .dockerignore keeps node_modules/.next/.git out of context.
COPY --chown=node:node . .

ENV NODE_ENV=production
ENV WARDEN_MODE=live

# Liveness: the worker writes /tmp/warden-worker.alive after each successful poll.
# A hung loop or an unreachable database stops the writes, so a heartbeat older
# than 20s marks the container unhealthy for the orchestrator to restart it.
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=3 \
  CMD test -f /tmp/warden-worker.alive && test "$(( $(date +%s) - $(stat -c %Y /tmp/warden-worker.alive) ))" -lt 20

# Poll the Aurora job queue forever. DATABASE_URL and the provider keys come from
# the runtime environment (never baked into the image); the rest of the config
# (linked repo, GitHub token, delivery mode, model assignments) is read from the
# settings overlay in Aurora, set through the dashboard.
CMD ["npm", "run", "worker"]
