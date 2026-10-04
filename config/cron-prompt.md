Create the weekly AI & Agentic Systems newsletter for the seven-day period ending on the run date. This is the canonical editorial run for both Telegram and the future GitHub Pages archive; do not create or invoke another schedule.

## Durable contract

Work from `/home/michael/workspace/newsletter` and read these files before researching:

- `config/sources.yml`
- `docs/editorial-contract.md`
- `schemas/newsletter.v1.schema.json`
- `issues/manifest.json`

Use the source registry as a starting pool, not as a quota. Sources marked `coverage_priority: true` are mandatory enumeration feeds, not optional discovery inputs. Search beyond the registry only after reviewing every priority-feed entry in the coverage window. Prefer first-party release notes, official announcements, repositories/changelogs, papers, and government advisories. Secondary reporting may clarify significance but cannot be the sole support for a material claim. Other newsletters are discovery inputs only; do not reproduce their prose.

## Research and selection

1. Set `coverage.start` and `coverage.end` to the preceding seven calendar days in `Asia/Jerusalem`, inclusive. Set `issue_id` equal to `coverage.end`.
2. Before open-web searching, enumerate mandatory RSS coverage into `/home/michael/.hermes/cron/drafts/weekly-ai-devops-digest/<issue_id>.coverage.json`:
   `node scripts/source-coverage.mjs collect --start <coverage.start> --end <coverage.end> --out <coverage-ledger-path>`
3. Review every ledger entry. Change each `decision` from `pending` to `included` or `excluded`; every exclusion needs a concrete editorial reason. An included entry may be represented by the same canonical URL in the issue or by a clearly identified duplicate primary announcement.
4. Run `node scripts/source-coverage.mjs verify <coverage-ledger-path>`. Do not draft or deliver the issue while any priority entry remains unresolved.
5. Research beyond the mandatory feeds. Verify publication/event dates and direct URLs. Do not include developments outside the coverage window unless the in-window event is a material update and `new_delta` states exactly what changed.
6. Distinguish GA, preview, limited release, open source, dated announcement, undated announcement, and unconfirmed claims.
7. Score candidates using the editorial contract's 21-point rubric. Target 5–6 developments; use as few as 3 if fewer material, well-supported stories exist. Never fill a quota with weak items.
8. Check `issues/manifest.json` and prior issue artifacts for duplicates. Repeat an item only for a material new delta.
9. Every material claim must map to declared `citation_ids`. Prefer sources published during the coverage period. Do not invent dates, availability, pricing, benchmarks, or regional support.

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

Submit the artifact to the authenticated n8n publisher in dry-run mode:

`node /home/michael/workspace/newsletter/scripts/submit-to-n8n.mjs <artifact-path>`

Require a successful response with `ok: true`. If `would_publish: true`, immediately publish the same validated artifact:

`node /home/michael/workspace/newsletter/scripts/submit-to-n8n.mjs <artifact-path> --publish`

Require a successful response with `status: "published"` or `status: "idempotent_noop"` before reporting success. A dry-run or publication failure must not suppress the Telegram digest; instead, state that web publication failed and include the error.

## Telegram edition

Return only the human-readable digest for Telegram, under roughly 1,200 words:

1. `Weekly AI & Agentic Systems Digest — <date range>`
2. **What changed** — each item states status, the change, why it matters, and an inline direct source link.
3. **DevOps / platform impact** — concrete implications for reliability, deployment, observability, security, cost, governance, developer workflow, or data residency.
4. **Bring to work** — what it is, fit for an Amazon Bedrock/Bedrock AgentCore stack, effort, and one bounded next step.
5. **Watchouts** — licensing, hosting, security, regional availability, cost, or claims that still need validation.
6. **Sources** — compact direct links.
7. Final operational line: `Web publication: published and verified.` Only use this after the publisher returns `status: "published"` or `status: "idempotent_noop"`; otherwise state `Web publication failed; Telegram digest unaffected.` and include the error.

Use original wording, concise prose, and calibrated confidence. Publication is pre-authorized for this scheduled newsletter only after local validation and a successful n8n dry-run; do not publish any other content or a schema-invalid artifact.
