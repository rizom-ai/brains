# Plan: Non-Blocking A2A Message Handling

## Context

The A2A `message/send` handler synchronously awaits `agentService.chat()` (30-60s+) before returning the HTTP response. This causes timeouts through Caddy reverse proxy and makes the protocol brittle. The A2A spec already supports async task flow: return immediately with a "working" task, caller polls `tasks/get` until completion. The `@a2a-js/sdk` supports this, and our `TaskManager` already has the state machine — we just need to wire it up.

## Changes

### Step 1: Split `handleSendMessage` into blocking/non-blocking paths

**File: `interfaces/a2a/src/jsonrpc-handler.ts` (lines 113-189)**

- Check `parsed.data.configuration?.blocking` (schema already exists at line 28, unused)
- **Default (non-blocking)**: Create task → move to "working" → fire `agentService.chat()` as detached promise → return "working" task immediately
- **`blocking: true`**: Keep current synchronous behavior for backward compatibility
- Extract AI processing into `processInBackground(taskId, message, conversationId, context)` — must have its own try/catch to avoid unhandled rejections, transitions task to "completed" or "failed"

### Step 2: Add polling to client `sendMessage`

**File: `interfaces/a2a/src/client.ts` (lines 173-226)**

- After initial `message/send`, check if returned task is in a terminal state
- If non-terminal ("submitted"/"working"), poll `tasks/get` with exponential backoff (500ms → 5s cap, 120s total timeout)
- New helper: `pollTaskCompletion(endpointUrl, taskId, fetchFn, authToken)` encapsulates polling
- `a2a_call` tool needs no changes — polling is transparent inside `sendMessage`
- Add `pollIntervalMs` and `maxWaitMs` to `A2AClientDeps` for testability

### Step 3: Update tests

**File: `interfaces/a2a/test/jsonrpc-handler.test.ts`**

- Add `configuration: { blocking: true }` to existing tests that expect immediate completion
- New tests: non-blocking returns "working", background processing completes, failure transitions to "failed"

**File: `interfaces/a2a/test/client.test.ts`**

- New tests: client polls on non-terminal response, client handles timeout

### Step 4: Caddy timeout

**File: `deploy/providers/hetzner/templates/Caddyfile.template`**

- Add explicit `response_header_timeout 30s` to `/a2a` reverse_proxy blocks (HTTP + HTTPS)
- With non-blocking mode, server responds in milliseconds; timeout protects `blocking: true` case

## Files

| File                                                    | Action                                             |
| ------------------------------------------------------- | -------------------------------------------------- |
| `interfaces/a2a/src/jsonrpc-handler.ts`                 | Split handleSendMessage into blocking/non-blocking |
| `interfaces/a2a/src/client.ts`                          | Add pollTaskCompletion, integrate into sendMessage |
| `interfaces/a2a/test/jsonrpc-handler.test.ts`           | Update existing + add non-blocking tests           |
| `interfaces/a2a/test/client.test.ts`                    | Add polling tests                                  |
| `deploy/providers/hetzner/templates/Caddyfile.template` | Add explicit timeouts                              |

## Verification

1. `bun test interfaces/a2a/` — all tests pass
2. `bun run typecheck --filter=@brains/a2a` — clean
3. Manual test: start a brain, use A2A Inspector to send a message — should get "working" response immediately, then poll shows "completed"
4. Manual test: `a2a_call` tool from another brain — should transparently poll and return final result
