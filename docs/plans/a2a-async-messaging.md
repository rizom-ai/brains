# Plan: Non-Blocking A2A Message Handling

## Context

The A2A `message/send` handler synchronously awaits `agentService.chat()` (30-60s+) before returning the HTTP response. This causes timeouts through Caddy reverse proxy and makes the protocol brittle. The A2A spec already supports async task flow: return immediately with a "working" task, caller polls `tasks/get` until completion. The `@a2a-js/sdk` supports this, and our `TaskManager` already has the state machine — we just need to wire it up.

## Changes

### Step 1: Split `handleSendMessage` into blocking/non-blocking paths

**File: `interfaces/a2a/src/jsonrpc-handler.ts` (lines 113-189)**

- Check `parsed.data.configuration?.blocking` (schema already exists at line 28, currently unused)
- **Default (non-blocking)**: Create task → move to "working" → fire `processInBackground()` as detached promise → return "working" task immediately
- **`blocking: true`**: Keep current synchronous behavior for backward compatibility
- `processInBackground(taskId, message, conversationId, context)` — standalone function in the same file. Own try/catch to avoid unhandled rejections. Transitions task to "completed" or "failed".

### Step 2: Stale task protection

**File: `interfaces/a2a/src/task-manager.ts`**

Tasks in "working" state that never complete (brain crash, unhandled error) stay "working" forever. Add a max processing timeout:

- On each `tasks/get` call, check if a "working" task has exceeded the timeout (default: 5 minutes)
- If expired, auto-transition to "failed" with message "Processing timed out"
- Store `workingStartedAt` timestamp when transitioning to "working"
- Callers that never poll: task stays "working" until TTL eviction (existing 1-hour TTL handles this)

### Step 3: Add polling to client `sendMessage`

**File: `interfaces/a2a/src/client.ts` (lines 173-226)**

- After initial `message/send`, check if returned task is in a terminal state
- If non-terminal ("submitted"/"working"), poll `tasks/get` with exponential backoff
- Polling schedule: `[500, 1000, 2000, 4000, 5000, 5000, ...]` — cap at 5s, max 30 iterations (~120s total)
- New helper: `pollTaskCompletion(endpointUrl, taskId, fetchFn, authToken)` encapsulates polling
- `a2a_call` tool needs no changes — polling is transparent inside `sendMessage`
- Add `pollIntervalMs` and `maxWaitMs` to `A2AClientDeps` for testability

### Step 4: Update tests

**File: `interfaces/a2a/test/jsonrpc-handler.test.ts`**

All 12 existing tests expect synchronous completion. Each needs `configuration: { blocking: true }` to preserve current behavior.

New tests for non-blocking:

- Returns "working" task immediately (no await on agent)
- Background processing completes → task transitions to "completed"
- Background processing fails → task transitions to "failed"
- Stale task auto-fails after timeout

**File: `interfaces/a2a/test/client.test.ts`**

- Client polls on non-terminal response until "completed"
- Client handles timeout (max iterations exceeded → error)
- Client returns immediately on terminal response (no polling)

### Step 5: Caddy timeout

**File: `deploy/providers/hetzner/templates/Caddyfile.template`**

- Add explicit `response_header_timeout 30s` to `/a2a` reverse_proxy blocks (HTTP + HTTPS)
- With non-blocking mode, server responds in milliseconds; timeout protects `blocking: true` case

## Files

| File                                                    | Action                                              |
| ------------------------------------------------------- | --------------------------------------------------- |
| `interfaces/a2a/src/jsonrpc-handler.ts`                 | Split handleSendMessage, add processInBackground    |
| `interfaces/a2a/src/task-manager.ts`                    | Add workingStartedAt, stale task auto-fail          |
| `interfaces/a2a/src/client.ts`                          | Add pollTaskCompletion, integrate into sendMessage  |
| `interfaces/a2a/test/jsonrpc-handler.test.ts`           | Add blocking:true to all 12 tests + new async tests |
| `interfaces/a2a/test/client.test.ts`                    | Add polling + timeout tests                         |
| `deploy/providers/hetzner/templates/Caddyfile.template` | Add explicit timeouts                               |

## Follow-up: A2A Inspector compatibility

The A2A Inspector and some third-party clients don't implement `tasks/get` polling — they expect `message/send` to return a completed task. Options:

- **`message/stream` (SSE)**: Server pushes state transitions over a streaming connection. The A2A spec supports this via `message/stream`. Most modern clients (including the Inspector) support SSE.
- **Inspector-side fix**: The Inspector should poll `tasks/get` for non-terminal responses per the A2A spec.

Blocking mode was intentionally removed — it ties up the connection for 30-60s+ and causes Caddy timeouts. SSE is the proper solution for clients that want real-time updates without polling.

## Verification

1. `bun test interfaces/a2a/` — all tests pass
2. `bun run typecheck --filter=@brains/a2a` — clean
3. Manual test: start a brain, use A2A Inspector to send a message — should get "working" response immediately, then poll shows "completed"
4. Manual test: `a2a_call` tool from another brain — should transparently poll and return final result
5. Kill brain during processing → restart → stale "working" task auto-fails on next `tasks/get`
