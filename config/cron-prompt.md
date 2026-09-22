Create the weekly AI & Agentic Systems newsletter for the seven-day period ending on the run date. This is the canonical editorial run for both Telegram and the future GitHub Pages archive; do not create or invoke another schedule.

## Durable contract

Work from `/home/michael/workspace/newsletter` and read these files before researching:

- `config/sources.yml`
- `docs/editorial-contract.md`
- `schemas/newsletter.v1.schema.json`
- `issues/manifest.json`

Use the source registry as a starting pool, not as a quota. Search beyond it only when needed. Prefer first-party release notes, official announcements, repositories/changelogs, papers, and government advisories. Secondary reporting may clarify significance but cannot be the sole support for a material claim. Other newsletters are discovery inputs only; do not reproduce their prose.

## Research and selection

1. Set `coverage.start` and `coverage.end` to the preceding seven calendar days in `Asia/Jerusalem`, inclusive. Set `issue_id` equal to `coverage.end`.
2. Research before writing. Verify publication/event dates and direct URLs. Do not include developments outside the coverage window unless the in-window event is a material update and `new_delta` states exactly what changed.
3. Distinguish GA, preview, limited release, open source, dated announcement, undated announcement, and unconfirmed claims.
4. Score candidates using the editorial contract's 21-point rubric. Target 5–6 developments; use as few as 3 if fewer material, well-supported stories exist. Never fill a quota with weak items.
5. Check `issues/manifest.json` and prior issue artifacts for duplicates. Repeat an item only for a material new delta.
6. Every material claim must map to declared `citation_ids`. Prefer sources published during the coverage period. Do not invent dates, availability, pricing, benchmarks, or regional support.

## Required outputs

Produce one valid `newsletter.v1` JSON object matching `schemas/newsletter.v1.schema.json`, including:

- `revision: 1` for a new issue
- 3–6 scored developments
- 2–5 DevOps/platform impacts
- 2–5 practical bring-to-work evaluations
- at least one watchout
- direct HTTPS citations
- a complete `telegram_text`

Write the JSON artifact to:

`/home/michael/.hermes/cron/drafts/weekly-ai-devops-digest/<issue_id>.json`

Create the directory if necessary. Validate the artifact locally by importing `validateIssue` from `publisher/newsletter.mjs` with Node.js. If validation fails, correct the artifact before continuing.

Submit the artifact to the n8n publisher in **dry-run mode only**:

`node /home/michael/workspace/newsletter/scripts/submit-to-n8n.mjs <artifact-path>`

Do not pass `--publish`. A publication preview failure must not suppress the Telegram digest.

## Telegram edition

Return only the human-readable digest for Telegram, under roughly 1,200 words:

1. `Weekly AI & Agentic Systems Digest — <date range>`
2. **What changed** — each item states status, the change, why it matters, and an inline direct source link.
3. **DevOps / platform impact** — concrete implications for reliability, deployment, observability, security, cost, governance, developer workflow, or data residency.
4. **Bring to work** — what it is, fit for an Amazon Bedrock/Bedrock AgentCore stack, effort, and one bounded next step.
5. **Watchouts** — licensing, hosting, security, regional availability, cost, or claims that still need validation.
6. **Sources** — compact direct links.
7. Final operational line: `Web publication: dry-run prepared for approval.` If n8n failed, instead state `Web publication preview failed; Telegram digest unaffected.`

Use original wording, concise prose, and calibrated confidence. Do not publicly publish or commit an issue without explicit user approval.
