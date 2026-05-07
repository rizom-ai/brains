# Plan: A2A Reliability Hardening

## Status

Proposed. Created after a transient `fetch failed` during a Rover → `yeehaa.io` A2A call; retrying the same tool call later succeeded.

## Context

The A2A client is a remote network boundary. Calls can fail because of DNS, TLS, connection resets, cold starts, Cloudflare/proxy behavior, or SSE streams that stall before a terminal event.

Today, `interfaces/a2a/src/client.ts` can surface an opaque error such as:

```txt
fetch failed
```

That is not enough to distinguish a transient network blip from a protocol bug or remote-agent failure.

## Goals

- Make A2A network failures diagnosable.
- Add explicit request and stream idle timeouts.
- Retry safe transient failures once.
- Preserve current A2A protocol behavior and response shape.
- Add regression tests for timeouts, retries, and stalled streams.

## Non-goals

- Replacing A2A bearer-token auth with OAuth. A2A auth is covered by the request-signing plan.
- Changing the A2A message protocol.
- Adding background delivery/queueing for offline agents.
- Retrying non-idempotent multi-step workflows beyond the initial `message/stream` request.

## Proposed design

### Explicit timeout policy

Add timeout options to the A2A client internals:

- `requestTimeoutMs` — max time to establish the POST response, default 30s.
- `streamIdleTimeoutMs` — max time between SSE chunks while waiting for a final event, default 60s.
- `maxNetworkAttempts` — network-level attempts, default 2.

Timeouts should use `AbortController` so the underlying fetch/read is cancelled.

### Retry policy

Retry once when the failure is likely transient:

- fetch throws before an HTTP response exists
- request timeout before response headers
- stream read throws due to network reset before terminal event

Do not retry by default for:

- 4xx HTTP responses
- malformed JSON-RPC responses
- terminal A2A task failures returned by the remote agent

Optionally retry 502/503/504 later if we see that in production, but keep v1 conservative.

### Error surfacing

Return clearer tool errors, for example:

```txt
Failed to reach remote agent after 2 attempts: request timed out after 30000ms
```

```txt
A2A stream stalled waiting for final event after 60000ms
```

Include the low-level `cause` message when available (`ECONNRESET`, TLS failure, DNS failure, etc.). Log structured diagnostic fields through the plugin logger if available.

### SSE stream handling

The current client waits for a terminal `status-update` SSE event with `final: true`. Preserve that behavior, but add an idle timer that resets whenever a chunk arrives.

If the stream ends without a terminal event, keep returning a protocol-level failure.

## Regression tests

Add targeted tests under `interfaces/a2a/test`:

1. **Initial POST timeout**
   - mock `fetch` that never resolves
   - assert a clear timeout error

2. **SSE idle timeout**
   - mock `fetch` returning a stream that emits `working` and then stalls
   - assert a clear stream-idle timeout error

3. **Retry on transient network failure**
   - first `fetch` throws `fetch failed`
   - second returns a successful final SSE event
   - assert success and two attempts

4. **No retry on client errors**
   - remote returns `401` or `403`
   - assert no retry and a clear HTTP error

5. **Successful slow response under timeout**
   - stream emits final event after a delay below `streamIdleTimeoutMs`
   - assert success

6. **Stream ends without final event**
   - stream closes after non-final events
   - assert existing protocol error remains clear

## Rollout

1. Add tests with mocked `fetch` and controlled `ReadableStream` behavior.
2. Implement timeout helpers and retry loop inside `interfaces/a2a/src/client.ts`.
3. Validate with unit tests and a live `yeehaa.io` smoke call.
4. If production failures persist, add structured telemetry/logging around failure causes and elapsed timings.

## Related

- `docs/plans/a2a-request-signing.md` — future A2A authentication hardening
- `docs/plans/brain-oauth-provider.md` — MCP/OAuth auth provider foundation; does not replace A2A auth
