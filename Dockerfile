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

WORKDIR /app

# Install dependencies first so the layer caches across source-only changes.
# tsx is a devDependency the worker runs through, so install the full set.
COPY package.json package-lock.json ./
RUN npm ci

# Application source. .dockerignore keeps node_modules/.next/.git out of context.
COPY . .

ENV NODE_ENV=production
ENV WARDEN_MODE=live

# Poll the Aurora job queue forever. DATABASE_URL and the provider keys come from
# the runtime environment (never baked into the image); the rest of the config
# (linked repo, GitHub token, delivery mode, model assignments) is read from the
# settings overlay in Aurora, set through the dashboard.
CMD ["npm", "run", "worker"]
