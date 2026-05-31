# Plan: web-chat agent progress + token streaming

## Status

Proposed.

## Problem

`POST /api/chat` opens a streaming response, writes a single `thinking` status,
then blocks on a synchronous agent turn before emitting anything else:

```text
interfaces/web-chat/src/web-chat-interface.ts:2673  handleStreamedChat → await agent.chat(...)
shell/ai-service/src/agent-service.ts:386           processMessage → getAgent().generate(...)
```

`ToolLoopAgent.generate()` runs the whole LLM + up-to-10-step tool loop and only
returns at the end. Raising the Bun idle timeout (shipped — see
`WEBSERVER_IDLE_TIMEOUT_SECONDS`) stops the socket being closed, but a slow first
turn (cold agent init + a large uploaded file in the prompt + tool loop) still
shows the user nothing but the spinner for many seconds. We want the turn to
_feel_ alive, then actually stream tokens.

## Existing seams (verified)

- **Per-conversation writer registry.** `activeStreams: Map<conversationId, {writer}>`
  is set for the open request in `handleStreamedChat`
  (`web-chat-interface.ts:2137`, `:2679`). `handleProgressEvent` already routes
  background `JobProgressEvent`s to that writer as `data-progress` parts
  (`:2282`–`:2298`), and the React client renders them (`data-parts.tsx`).
- **Agent tool events already fire, unconsumed.** `createToolExecuteWrapper`
  emits `tool:invoking` / `tool:completed` / `tool:failed` to the message bus,
  each carrying `conversationId` + `channelId` for routing
  (`shell/ai-service/src/tool-events.ts`). No subscriber exists today — the
  events are discarded.
- **The SDK agent can stream.** `ToolLoopAgent` (wrapped by `BrainAgent`,
  `shell/ai-service/src/brain-agent.ts`) exposes `stream()` alongside
  `generate()`, plus `onStepFinish` / `experimental_onToolCallStart` callbacks.
- **Context already threads to the turn.** `agent.chat(message, conversationId,
context)` carries `channelId`/`interfaceType` into `processMessage` via the
  state-machine `RECEIVE_MESSAGE` event — the same channel a delta/progress
  callback would ride.

## Phase A — visible progress (consumer-side only, low risk)

Surface the agent's own tool activity as transient status, reusing the rails
above. **No change to `brain-agent.ts`, `agent-service.ts`, or the request/
response contract** — the events already exist.

1. **Subscribe to tool events in the interface.** In the message-interface
   registration path (mirror how job-progress is wired in
   `shell/plugins/src/public/message-interface-plugin.ts`), subscribe to
   `tool:invoking` / `tool:completed` / `tool:failed`.
2. **Route to the active stream.** Add a handler on `WebChatInterface` that looks
   up `getActiveStream(event.channelId)` and, when present, writes a transient
   `data-status` part (e.g. `Using <toolName>…` on invoking, clear/idle on
   completed). Reuse the existing `data-status` shape so the client needs no new
   renderer.
3. **Decide placement.** Tool events are generic to all message interfaces, so
   prefer a base-class hook (`onToolEvent`) defaulting to no-op, overridden by
   web-chat — matching the `onProgressUpdate` pattern — rather than web-chat-only
   wiring.

Outcome: the user sees the agent working step by step; the final text still
arrives in one block.

### Phase A validation

- Unit: a spy message bus emits `tool:invoking` with a known `channelId`; assert
  the matching active-stream writer receives a `data-status` part, and that an
  event for an unknown channel is dropped (no throw).
- No new always-on slow tests (keep the suite fast, per the timeout-fix
  regression tests).

## Phase B — real token streaming (the "feels fast" win, medium risk)

Switch the turn from `generate()` to `stream()` and forward text deltas live.

1. **BrainAgent.** Add a streaming path (a `stream()` method, or `generate()`
   gains an `onTextDelta` option) returning the SDK `StreamTextResult` whose
   `fullStream` yields text deltas + tool/step events and still resolves a final
   result.
2. **AgentService.** In `processMessage`, consume the stream to completion (so
   conversation persistence + `extractToolResults` + the
   `pendingConfirmations` branch keep working unchanged) while forwarding each
   delta through an `onTextDelta` callback supplied via the chat `context`.
3. **WebChatInterface.** In `handleStreamedChat`, replace the single end-of-turn
   `writeText` with `text-start` → incremental `text-delta` → `text-end` driven
   by the callback.

### Phase B risks / open questions

- **Confirmation branch.** Today text is deliberately withheld when a tool needs
  approval (`responseText = "Confirmation required."`). Streaming must not leak
  pre-approval model text — gate delta forwarding until we know the turn isn't
  an approval turn, or buffer until first non-tool text.
- **Abort on disconnect.** `agent.chat` has no `AbortSignal` today; a closed tab
  doesn't cancel generation. Phase B should thread the request signal so a
  disconnect aborts the stream (also caps wasted model spend).
- **State-machine fit.** The xstate `waitFor` turn model stays; deltas are a
  side-channel, not a new state. Confirm `fullStream` consumption inside the
  actor doesn't change `snapshot.context.response`.

### Phase B validation

- Unit: spy agent yields deltas `["Hel", "lo"]`; assert the web-chat writer
  receives ordered `text-delta`s and a final `text-end`, and the persisted
  assistant message equals the concatenation.
- Unit: an approval turn streams no model text before the approval request.

## Recommendation

Ship Phase A first — contained, reuses live rails, independent of Phase B, and
removes the "is it frozen?" feeling. Do Phase B once A proves the UX channel.
