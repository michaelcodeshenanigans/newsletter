# Newsletter Architecture

## Objective

Improve the existing Hermes cron job `weekly-ai-devops-digest` so one weekly research and editorial run produces both:

1. the existing Telegram digest; and
2. a permanent web edition at `https://michaelcodeshenanigans.github.io/newsletter/`.

There must be only one weekly clock. The existing Hermes cron job remains that clock. n8n is an event-driven publisher, not a second scheduler. No scheduled GitHub Actions workflow is required.

## Current job baseline

| Setting | Value |
|---|---|
| Job | `weekly-ai-devops-digest` |
| Job ID | `4790e0016267` |
| Schedule | `0 12 * * 6` |
| Timezone | `Asia/Jerusalem` |
| Delivery | Telegram DM |
| Continuity | Enabled |
| Model | `gpt-5.6-sol` through `openai-codex` |
| Main audience | AI innovation lead operating an AWS Bedrock-centered agentic stack |

The existing job remains responsible for research, selection, analysis, editing, and Telegram delivery.

## System design

```text
Saturday 12:00 Asia/Jerusalem
          |
          v
Hermes cron: weekly-ai-devops-digest
  1. Collect and verify the preceding seven days
  2. Compare candidates against previous editions
  3. Score and select material developments
  4. Produce a newsletter.v1 JSON artifact
  5. Submit the artifact to an n8n production webhook
  6. Return the readable Telegram edition
          |                         |
          |                         +--> Hermes delivers the final response to Telegram
          v
n8n webhook workflow (no schedule trigger)
  1. Authenticate and validate the artifact
  2. Enforce idempotency and revision rules
  3. Render deterministic static files
  4. Commit all changed files atomically to GitHub
  5. Read back and verify the commit
          |
          v
michaelcodeshenanigans/newsletter
          |
          v
GitHub Pages: /newsletter/
```

## Responsibility boundaries

### Hermes

- Researches current sources.
- Distinguishes shipped, preview, announced, published, and unconfirmed developments.
- Performs editorial deduplication against prior issues.
- Scores candidates and applies the editorial contract.
- Produces the structured artifact and Telegram rendering.
- Calls the n8n publishing webhook.
- Delivers the Telegram edition even when web publication fails.

### n8n

- Has no time-based trigger.
- Validates authentication, schema, size, dates, URLs, and section limits.
- Performs mechanical idempotency checks.
- Converts structured data to deterministic HTML, JSON, archive, and feed files.
- Commits the complete publication as one Git commit.
- Verifies the Git ref after writing.
- Returns a concise publication result to Hermes.

### GitHub

- Stores all published issues and publication metadata.
- Provides the durable deduplication ledger.
- Hosts the generated site through GitHub Pages.
- Optionally provides pull-request approval before publication.

## Artifact contract

Hermes sends a JSON document conforming to `schemas/newsletter.v1.schema.json`.

Required transport headers:

```text
Content-Type: application/json
Idempotency-Key: <issue_id>:r<revision>
X-Hermes-Timestamp: <Unix timestamp>
X-Hermes-Signature: sha256=<HMAC-SHA256 of the exact request body>
```

The canonical content hash is SHA-256 over normalized JSON with object keys sorted and transport-only metadata excluded.

### Identity and corrections

- `issue_id` is the Saturday publication date in `YYYY-MM-DD` format.
- `revision` begins at `1`.
- A correction increments the revision.
- The same issue ID, revision, and hash is an idempotent success.
- The same issue ID and revision with a different hash is rejected with HTTP 409.
- A lower revision is rejected as stale.
- A higher revision replaces the issue and records the correction.

## Repository output

```text
README.md
index.html
archive/index.html
feed.xml
latest.json
issues/manifest.json
issues/YYYY/YYYY-MM-DD/index.html
issues/YYYY/YYYY-MM-DD/issue.json
docs/architecture.md
docs/editorial-contract.md
config/sources.yml
schemas/newsletter.v1.schema.json
```

Generated-file responsibilities:

- `index.html`: current issue and links to recent issues.
- `archive/index.html`: complete issue archive, newest first.
- `feed.xml`: the latest 20 issues.
- `latest.json`: machine-readable pointer to the newest published issue.
- `issues/manifest.json`: ordered publication ledger and revision history.
- `issue.json`: validated structured artifact plus canonical hash.
- Issue `index.html`: permanent human-readable web edition.

All generated URLs must include the GitHub project-site base path `/newsletter/`.

## n8n workflow

### Trigger and validation

1. **Webhook node:** production-only HTTPS endpoint; POST only.
2. **Raw-body capture:** required for exact HMAC verification.
3. **Authentication code node:** reject invalid HMAC or timestamps outside a five-minute window.
4. **Schema validation node:** reject unknown schema versions or malformed payloads.
5. **Policy validation node:** verify:
   - the coverage range is seven days;
   - the issue ID matches the publication date;
   - citation URLs use HTTPS;
   - required sections and editorial item limits are satisfied;
   - payload size is below the configured maximum;
   - all citation references resolve to declared citation IDs.

### Publication ledger

6. Read `issues/manifest.json` and any matching `issue.json` from GitHub.
7. Apply the idempotency and revision table above.
8. Render all files from the artifact and manifest. Never parse `telegram_text` to build the site.

### Atomic GitHub publication

Use GitHub's Git data API rather than several independent file-update calls:

1. Read the current `main` ref and commit.
2. Read the base tree.
3. Create blobs for every changed file.
4. Create one tree containing all changes.
5. Create one commit with message `Publish newsletter <issue_id> r<revision>`.
6. Update `refs/heads/main` without force.
7. Read the ref back and verify it points to the new commit.

If the branch changes concurrently, refetch and rebuild once. Never force-push.

### Response to Hermes

Success example:

```json
{
  "status": "published",
  "issue_id": "2026-09-26",
  "revision": 1,
  "commit_sha": "...",
  "web_url": "https://michaelcodeshenanigans.github.io/newsletter/issues/2026/2026-09-26/"
}
```

An exact replay returns `status: idempotent_noop`. Validation and publication failures return a stable error code and do not partially update the repository.

## Telegram behavior

The cron job's final response remains the concise Telegram edition. n8n must not send the same digest to Telegram.

Recommended final footer:

```text
Web edition: <published URL>
```

If publication fails:

```text
Web edition: publication failed; the editorial digest was delivered normally.
```

Web publication failure must never suppress Telegram delivery.

## Approval modes

### Initial rollout: pull-request approval

For the first issues, n8n should:

1. Create or update `newsletter/<issue_id>-r<revision>`.
2. Commit the complete rendered publication to that branch.
3. Open or reuse a pull request against `main`.
4. Return the pull-request URL to Hermes.

Merging the pull request publishes the issue. This gives a visible HTML diff and protects the public site while templates and prompts stabilize.

### Later rollout: automatic publication

After several successful issues, n8n may commit directly to `main`. Idempotency and verification requirements remain unchanged.

## Secrets and permissions

### Hermes profile `.env`

- `NEWSLETTER_N8N_WEBHOOK_URL`
- `NEWSLETTER_WEBHOOK_HMAC_SECRET`

Do not put either value in a cron prompt, source file, or repository.

### n8n credentials

- Shared HMAC secret.
- GitHub App installation credential, preferred.
- A fine-grained personal access token is acceptable during setup if restricted to `michaelcodeshenanigans/newsletter`.

Minimum GitHub permissions:

- Contents: read/write.
- Pull requests: read/write only while approval mode is used.

Hermes does not need a separate GitHub publishing credential when n8n owns publication.

## Failure handling

- Authentication or schema failure: return 4xx; do not touch GitHub.
- Transient GitHub failure: exponential backoff, at most three attempts.
- Concurrent branch change: rebuild once from the new head.
- Commit verification failure: mark the n8n execution failed.
- Webhook timeout: Hermes retries the identical payload with the same idempotency key.
- Persistent publisher failure: Hermes still returns the Telegram edition with a failure footer.
- Pages propagation delay: optionally perform bounded URL checks after commit; do not create another schedule.
- Recovery: replay the saved artifact or rerun the existing Hermes job. Publication deduplication prevents duplicate issues.

## Source collection strategy

The first implementation can use Hermes web research against `config/sources.yml`. The durable target is a small collector script or newsletter skill that:

- fetches RSS/Atom feeds and documented APIs concurrently;
- uses ETag and Last-Modified caching where supported;
- normalizes timestamps and canonical URLs;
- restricts candidates to the coverage window;
- writes a bounded candidate ledger for the editorial pass;
- preserves primary and discovery-source provenance;
- never stores or republishes full article bodies.

A deterministic collector reduces research latency and leaves more of the cron run for editorial judgment. It does not introduce another schedule.

## Rollout plan

1. Preserve this architecture, source registry, editorial contract, and schema in the repository.
2. Build the deterministic site renderer and static template.
3. Build the n8n webhook in pull-request approval mode.
4. Add a reusable Hermes newsletter skill containing collection and publisher helpers.
5. Update the existing cron prompt to load that skill and submit `newsletter.v1`.
6. Run the existing cron manually to generate the first issue.
7. Validate Telegram output, pull-request diff, links, mobile rendering, archive, feed, and idempotent replay.
8. Keep manual approval until the publication path is stable.
