# Weekly AI & Agentic Systems Newsletter

A weekly, source-grounded briefing for AI innovation and engineering leads working with AWS Bedrock and adjacent agentic infrastructure.

## Publication

- Website: `https://michaelcodeshenanigans.github.io/newsletter/`
- Repository: `michaelcodeshenanigans/newsletter`
- Cadence: Saturdays at 12:00, Asia/Jerusalem
- Editorial scheduler: existing Hermes cron job `weekly-ai-devops-digest`
- Telegram delivery: retained
- Web publisher: authenticated event-driven n8n webhook

There is one weekly schedule: Hermes. n8n will validate, render, and publish the completed artifact; it will not independently research or schedule another digest.

## Design documents

- [Architecture](docs/architecture.md)
- [Editorial contract and QA checklist](docs/editorial-contract.md)
- [Source registry](config/sources.yml)
- [Newsletter artifact schema](schemas/newsletter.v1.schema.json)

## Editorial promise

Each issue answers:

1. What materially changed during the preceding seven days?
2. Was it announced, previewed, or actually shipped?
3. What changes for an AWS Bedrock-centered agentic stack?
4. What should a technical team test, review, defer, or monitor?

Primary sources are required for material claims. Other newsletters and secondary reporting may guide discovery or provide attributed commentary, but they are not copied or treated as release authority.

## Publication flow

```text
Hermes weekly cron
  -> research, deduplicate, score, and edit
  -> produce newsletter.v1 JSON
  -> send JSON to authenticated n8n webhook
  -> n8n validates and commits static files atomically
  -> GitHub Pages publishes the web edition
  -> Hermes delivers the concise edition to Telegram
```

No scheduled GitHub Actions workflow is needed.

## Implementation

- `config/cron-prompt.md` — durable prompt for the existing Hermes job.
- `publisher/newsletter.mjs` — validation and deterministic static-file renderer.
- `publisher/n8n-render.js` — renderer embedded into the n8n Code node.
- `publisher/build-workflow.mjs` — generates the importable n8n workflow.
- `n8n/weekly-ai-newsletter-publisher.json` — versioned workflow export.
- `scripts/submit-to-n8n.mjs` — authenticated submission client; defaults to dry-run.
- `test/` — Node test suite covering validation, idempotency, rendering, and workflow structure.

Run the checks with:

```bash
npm test
```

Preview an issue without writing to GitHub:

```bash
node scripts/submit-to-n8n.mjs /path/to/issue.json
```

`--publish` is intentionally explicit and must only be used after editorial approval.
