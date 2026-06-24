# Publish pipeline consolidation

## Status

Shipped in `fix/publish-pipeline-consolidation`. The single-executor architecture already existed; this work finished the remaining gaps around token expiry, error clarity, regression coverage, and dead-code removal.

Triggered by the direct publish confirmation loop on `yeehaa_content-pipeline_publish`, where the returned UUID confirmation token was stored in a per-tool-instance in-memory map. That bug was fixed in `ac11ef539` by replacing the map with a deterministic SHA256 token bound to `contentHash`; this follow-up also binds tokens to an expiry and returns explicit invalid/expired-token errors instead of looping.

## Current shape

```txt
publish tool                     (src/tools/publish.ts)
queue scheduler                  (src/scheduler-publish.ts)
message bus direct publish       (src/lib/message-handlers.ts)
        │
        ▼
PublishExecutor.resolveCandidate()   (src/publish-executor.ts)
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

Entry points already do only entrypoint-specific work:

- Direct publish tool: permission check, candidate resolution, confirmation, then `PublishExecutor.publish()`.
- Queue scheduler: scheduled execution, then `PublishExecutor.publish()`.
- Message bus direct publish: payload validation/permission boundary, then `PublishExecutor.publish()`.

Slug lookup is canonicalized to entity id before the executor runs (`src/tools/publish.ts`, `src/publish-executor.ts`).

## Confirmation contract

Extend the existing deterministic token to include expiry:

```txt
token = SHA256(toolName + entityType + entityId + contentHash + expiresAt)
```

Returned confirmation args become:

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

HMAC-with-secret is intentionally out of scope. The threat is in-process, and `contentHash` already binds the token to the content being published. Introducing a signing secret requires secret-management infrastructure that doesn't exist in this codebase yet; revisit only if cross-process verification becomes a requirement.

Confirmed calls with a bad token should return a clear error rather than issuing a fresh `needsConfirmation`:

- invalid token;
- expired token;
- content changed after confirmation.

## Shipped work

- Added `expiresAt` to the token hash input and returned confirmation args.
- Replaced the silent re-prompt on bad/missing token with explicit invalid/expired errors.
- Deleted unused `scheduler.publishDirect()`, which bypassed the executor.
- Added regression tests for:
  - invalid confirmation token returns an error, not a new confirmation;
  - expired confirmation token returns an error;
  - confirmation succeeds after tool recreation;
  - content changed after confirmation rejects publish.
- Kept existing entrypoint coverage showing:
  - queue execution uses the publish executor;
  - direct publish messages use registered providers through the executor-backed path;
  - already-published, no-provider, and non-public visibility failures are rejected before publishing.

## Non-goals

- Redesign publish providers such as LinkedIn/Buttondown.
- Change queue semantics or scheduling policy.
- Add new publishing destinations.
- Introduce HMAC/secret-based token signing.
- Replace the confirmation UX across all tools.

## Validation

Passed:

- `bun test test/tools/publish.test.ts test/scheduler.test.ts`
- `bun run typecheck`
- `bun run lint`

## Completion criteria

- Confirmation tokens carry an expiry and fail explicitly when invalid or expired.
- `scheduler.publishDirect()` is removed.
- Regression tests cover invalid/expired tokens and preserve entrypoint parity coverage.
