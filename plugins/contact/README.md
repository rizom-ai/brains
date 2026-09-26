# @brains/contact

Unreleased, default-off contact intake. The package is available in the canonical
catalog for explicit addition but belongs to no default bundle. Its declarative
service package composes the private entity and service; without explicit `intake` configuration
it mounts **no HTTP routes**. There are no public tools. No deployment has enabled
this capability.

## Implemented

- The `contactRequest` entity declaration registers restricted Markdown records. Contact details
  stay in the body/frontmatter, not query metadata. Persistence rejects public or
  shared visibility. Embedding, full-text indexing and projection sourcing are off.
- Each record requires an explicit expiry after receipt and within a 90-day safety
  ceiling. That ceiling is not a default or approved production retention policy.
- The service declares a pull-based Inbox source. Lists contain generic
  summaries; admin-only plain-text detail contains the name, address and message.
  Expired records are hidden. The Done action guards against concurrent content
  updates; hiding an expired record is **not** deletion or retention enforcement.
- `ContactAdmission` gates requests before body reads and reserves forms/submissions
  using one runtime-state CAS ledger. Every process must share that database.
  Policies have no defaults: fixed-window global and network request, issuance and
  submission limits, token/receipt lifetimes and an entry cap are all explicit.
- Network buckets use host-owned socket addresses, grouped by IPv4 /24 or IPv6
  /64; mapped IPv4 addresses share the IPv4 bucket. Behind a proxy, these are the
  proxy's networks, not inferred visitor addresses. Forwarding headers and cookies
  are not accepted as network identity.
- Form credentials are random, short-lived and stored only as digests. Payload
  digests are keyed with the unpersisted credential. Retries retain a deterministic
  entity ID and original receipt time. Ambiguous writes fail closed without quota
  refunds. Runtime-state entries contain no contact fields or raw addresses.

## Form and persistence helpers

- `ContactHttpHandlers` implements GET `/contact`, POST `/contact`, and GET
  `/contact/thanks` without JavaScript. It enforces the configured origin and
  trusted socket identity, request quotas, URL-encoded fields only, streaming byte
  and read-time caps, and duplicate/unknown-field rejection. Drafts are escaped;
  responses are no-store with a restrictive CSP. Preview routing is opt-in.
- `ContactIntake.submit()` reserves aggregate storage capacity, conditionally
  creates the deterministic restricted entity, and reads it back before reporting
  saved. A receipt alone is never a success response. Lost acknowledgements can be
  reconciled, and retries do not overwrite or resurrect deleted records.
- Storage slots cap the number and reserved UTF-8 content bytes of intake-owned
  records across processes. The byte allowance includes room for status changes;
  it is not a bound on database/WAL files or backups. Unknown writes keep their
  capacity reserved rather than guessing that a timeout rolled them back.
- The entity's notification-pending marker survives failure between persistence
  and enqueue. The plugin enqueues a durable `@brains/contact:contact:notify` job containing only
  the request ID, with a stable deduplication key. Nothing is sent inline in POST.
  Queue deduplication suppresses pending duplicates; a CAS delivery lease also
  prevents concurrent workers from initiating the same attempt.
- `ContactIntake.maintain()` is a bounded, cancellation-aware recovery/retention
  pass: re-enqueue pending notifications and delete expired intake-owned records,
  releasing capacity only after confirmed deletion. It reports unresolved writes
  and enqueue failures without personal details. The plugin runs it at startup
  and through a declared daily recurring check, with shutdown cancellation and
  draining. Separate workers execute the same check; an owned shared-state
  timestamp/failure flag supplies the web process's freshness gate. There is no
  second process-local maintenance timer. Physical deletion can lag expiry until the next successful pass;
  downtime and backups are disclosed separately on the form.

The form and opt-in professional homepage have a theme-based first visual pass,
but neither is approved from a running-app preview. No hosted calls, site rebuilds
or browser-preview acceptance have been performed.

## Runtime configuration and delivery

`ContactPluginConfig.intake` requires every field explicitly: `http`, `admission`,
`storage`, `delivery`, `inboxUrl`, and `preview`. There is no implicit enabled
policy. Schema exports describe all bounds. Intake depends on `notifications`,
`studio` and `unified-inbox`; configure the notification recipient and transport
through their existing plugins, never through the visitor's fields.

- `inboxUrl` must be the same-origin Studio Inbox workspace URL, verified against
  Unified Inbox's declared mounted workspace URL at readiness (including custom Studio paths).
- Startup recovery must succeed before requests are admitted. Failed maintenance,
  clock regression or maintenance older than 26 hours closes intake. Operational
  health exposes only aggregate counts, pending/failed notification state and the
  latest maintenance report. Uncertain writes retain their capacity for recovery.
- Delivery policy requires `maxAttempts` (1–5) and `retryWindowSeconds` (60–3600).
  The first-attempt deadline, attempt count, short lease and outcome live in the
  bounded storage-slot ledger. Queue retries and new worker instances cannot
  reset them. Expired claims are checked again before initiating delivery.
- Every attempt uses `contact-notification:<request-id>`. The approved transport
  must honor that key for longer than the retry window, with stable provider/account
  configuration. This relies on provider idempotency, not an exactly-once email
  guarantee. A lost acknowledgement is retried with the same key; failed status
  can include an unconfirmed provider outcome.
- Notifications contain only a generic alert and the authenticated Inbox link,
  with secret sensitivity. The notifications plugin registers its internal
  subscription in execution-only workers too. Workers register execution
  dependencies and maintenance checks, but expose no HTTP handlers or ready hooks.
  A schema-validated `contact:form-discovery` subscription advertises at most three
  route metadata records in both roles, using the same route list as HTTP
  registration. Site builds require matching origin, GET/POST, public access and
  preview opt-in. Discovery conveys neither live readiness nor admission authority.
- A known acknowledgement is recorded before projecting status onto the entity.
  Failed or conflicting entity updates can be repaired without sending again.
  Success for the visitor still means **saved**, not necessarily emailed.
- Confirmed retention deletion removes the request's delivery ledger state too.
  Late completions cannot recreate it. Already queued ID-only jobs skip missing or
  expired records; their generic queue history follows shared queue housekeeping.

## Still required before public intake

Add deployment composition and complete running-app visual/behavioral preview
verification with synthetic transport. Approve copy, retention/deletion lag,
caps, publication and enablement separately.
Verify the proxy posture and transport idempotency contract. Verify that private
sync/backup destinations are actually private: restricted entity visibility does
not make a configured Git remote private. Preserve the runtime-state databases;
resetting them is not a supported way to recover capacity or extend retention.

Guest conversation attachment is absent, and unverified locator fields are
rejected. No contact operation calls a model or generates embeddings.

## Validation

From this package: `bun test` and `bun run typecheck`.
From the repository root: `bun run lint --filter=@brains/contact` (uses the
repository's TypeScript compatibility loader).

Tests use synthetic requests and temporary local SQLite databases, never live
contact delivery or hosted model providers.
