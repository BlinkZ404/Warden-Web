# Warden documentation

Design and engineering docs for Warden. The repo entry point is the root
[README.md](../README.md).

## Architecture

| Doc | What's in it |
|-----|-------------|
| [product/architecture-diagram.md](product/architecture-diagram.md) | The system diagram (control / coordination / execution planes), how a verdict is decided, and the fix-iterate loop |
| [product/architecture.md](product/architecture.md) | As-built design: the incident state machine, the safety model, and the simulation/live split |
| [product/best-practices.md](product/best-practices.md) | Engineering tradeoffs and the reasoning behind them |
| [product/db-posture-audit.md](product/db-posture-audit.md) | Database security and Row-Level-Security posture |

## Operations

| Doc | What's in it |
|-----|-------------|
| [operations/deploy-aws.md](operations/deploy-aws.md) | Deploying the EC2 worker and Aurora on AWS |

## Sample app

The bundled target app has its own [sample-app/README.md](../sample-app/README.md).
