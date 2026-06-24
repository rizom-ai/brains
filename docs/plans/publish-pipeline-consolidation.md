# Publish pipeline consolidation

## Status

Proposed. Triggered by the direct publish confirmation loop observed on `yeehaa_content-pipeline_publish`: the returned UUID confirmation token was stored in a per-tool-instance in-memory map, so confirmed calls could hit a fresh tool instance and receive a new confirmation instead of publishing.

A tactical fix exists for the direct tool confirmation token, but the broader publish surface still has multiple entrypoints that must stay behaviorally identical.

## Goal

Make publishing have one execution path and thin entrypoints, so direct publish, queued publish, and message-driven publish all validate and mutate entities the same way.

## Non-goals

- Redesign publish providers such as LinkedIn/Buttondown.
- Change queue semantics or scheduling policy.
- Add new publishing destinations.
- Replace the confirmation UX across all tools.

## Desired shape

```txt
publish tool
queue scheduler
message bus direct publish
        │
        ▼
PublishExecutor.resolveCandidate()
        │
        ▼
PublishExecutor.publish()
        │
        ├─ validates status/visibility/provider
        ├─ prepares publish content/assets
        ├─ calls provider.publish()
        ├─ marks entity published
        └─ runs publish asset preflight
```

Entry points should do only entrypoint-specific work:

- Direct publish tool: permission check, candidate resolution, confirmation, then `PublishExecutor.publish()`.
- Queue tool/scheduler: queue management and scheduled execution, then `PublishExecutor.publish()`.
- Message bus direct publish: payload validation/permission boundary, then `PublishExecutor.publish()`.

## Confirmation contract

Direct publish confirmation should be stateless across tool recreation and process boundaries.

Preferred token format:

```txt
token = HMAC(secret, toolName + entityType + entityId + contentHash + expiresAt)
```

Returned confirmation args should be canonical:

```json
{
  "entityType": "social-post",
  "id": "a-colleague-without-context",
  "confirmed": true,
  "confirmationToken": "...",
  "contentHash": "...",
  "expiresAt": "..."
}
```

Confirmed calls should never silently issue a fresh confirmation for a bad token. They should return a clear error:

- invalid token;
- expired token;
- content changed after confirmation.

## Implementation phases

### Phase 1 — Direct publish confirmation hardening

- Replace in-memory UUID token validation with stateless verification.
- Include expiry in the confirmation args.
- Return explicit errors for invalid/expired tokens instead of a new `needsConfirmation` loop.
- Preserve content-change protection via `contentHash`.

### Phase 2 — Entrypoint audit

- Trace all publish entrypoints:
  - direct publish tool;
  - queue scheduler;
  - message bus direct publish;
  - any provider-specific legacy handler.
- Document whether each path calls `PublishExecutor.publish()` or duplicates validation/mutation.

### Phase 3 — Remove duplicated publish logic

- Move shared validation into `PublishExecutor.resolveCandidate()` / `PublishExecutor.publish()`.
- Delete or narrow provider/status/frontmatter mutation logic outside the executor.
- Ensure slug lookup is canonicalized to entity id before execution.

### Phase 4 — Regression coverage

Add focused tests for:

- confirmation succeeds after tool recreation;
- invalid confirmation token returns an error, not a new confirmation;
- expired confirmation token returns an error;
- content changed after confirmation rejects publish;
- direct publish and queue execution both use the executor path;
- slug-based direct publish returns canonical id confirmation args;
- already-published, no-provider, and non-public visibility failures are consistent across direct and queued execution.

## Validation

- Run targeted content-pipeline publish tests.
- Run content-pipeline lint/typecheck.
- Run broader workspace checks only if shared contracts change.

## Completion criteria

- There is exactly one code path that calls publish providers and updates durable publish state.
- Confirmation tokens survive tool recreation without relying on in-memory maps.
- Invalid or expired confirmations fail clearly instead of looping.
- Queue, direct, and message-driven publish behavior are covered by regression tests.
