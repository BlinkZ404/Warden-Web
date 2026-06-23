# Warden — architecture diagram

Source for the submission diagram. Render it to an image one of two ways:

- Open `architecture-diagram.html` in a browser and screenshot it, or
- Paste the Mermaid block below into <https://mermaid.live> and export a PNG/SVG.

Every box is labeled with **what it is** and **what it does**; arrows show call
direction. Amazon Aurora is the system of record at the center.

```mermaid
flowchart TB
  U["Founder / operator<br/><small>dashboard · one-tap approve</small>"]

  subgraph VERCEL["Vercel · Next.js App Router (Fluid Compute)"]
    UI["Dashboard & approve UI<br/><small>incident feed · audit · settings</small>"]
    API["API routes<br/><small>Sentry webhook · approve · cron tick</small>"]
  end

  SENTRY["Sentry<br/><small>error source · HMAC-verified webhook</small>"]

  subgraph ENGINE["Warden engine · Vercel Functions (Node)"]
    ORCH["Orchestrator<br/><small>incident state machine</small>"]
    AGENTS["Agents<br/><small>investigate · fix · reviewer panel</small>"]
    WS["Per-incident git workspace<br/><small>clone · branch · apply fix</small>"]
    GATE["Verification gate<br/><small>boot app · replay request · run tests</small>"]
  end

  MODELS["Model providers<br/><small>Claude · OpenAI · … via AI Gateway</small>"]
  GH["GitHub repo<br/><small>linked code · verified fix → PR / merge</small>"]
  CICD["Your CI/CD<br/><small>deploys the merged fix</small>"]

  AURORA[("Amazon Aurora PostgreSQL Serverless v2<br/><small>state machine · append-only audit ·<br/>pgvector memory · scorecard · settings</small>")]

  U --> UI
  UI --> API
  SENTRY -->|webhook| API
  API --> ORCH
  ORCH --> AGENTS --> MODELS
  AGENTS --> WS
  ORCH --> WS --> GATE
  GATE -->|"verified fix: PR / merge"| GH --> CICD
  API <--> AURORA
  ORCH <--> AURORA
  GATE -.->|pgvector recall| AURORA
```

## One-line narration (for the description / video)

Sentry reports a production error to a Vercel API route, which records it in
**Amazon Aurora** and wakes the orchestrator. The orchestrator drives a state
machine — investigate, fix on an isolated git branch, review — then the
verification gate **boots the app and replays the real failing request** to prove
the error is gone. A verified fix is delivered as a PR or merge to the linked
GitHub repo, and the founder approves with one tap (or autopilot ships it).
Aurora is the system of record throughout: the state machine, an append-only
audit log, pgvector incident memory, the scorecard, and runtime settings.
