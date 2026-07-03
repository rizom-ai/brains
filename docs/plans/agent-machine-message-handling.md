# Plan: Agent machine mid-turn message handling

## Status

Proposed. Design decided in discussion: queue mid-turn messages with a
small bound and drain in order; a non-confirmation message during
`awaitingConfirmation` is an implicit "no" that cancels the pending
action; conversation actors get an idle-eviction lifecycle. Trigger:
the codebase review found the agent service silently drops or replays
messages under concurrency — the most user-visible open bug in the
repo.

## Context

Each conversation gets an xstate actor
(`shell/ai-service/src/agent-machine.ts`) with states
`idle → processing → awaitingConfirmation`. Two defects:

1. **Dropped messages.** `RECEIVE_MESSAGE` is only handled in `idle`
   (`agent-machine.ts:239-242`). `chat()`
   (`shell/ai-service/src/agent-service.ts:395-421`) sends it
   unconditionally, then `waitFor`s `idle | awaitingConfirmation`. A
   message arriving while `processing` is discarded by xstate; both
   callers then resolve on the first turn's completion and receive the
   **first** message's response. The second message is never processed
   and never persisted.

2. **Stale replay.** In `awaitingConfirmation` the `waitFor` predicate
   is already true, so a new `chat()` resolves immediately with
   `snapshot.context.response` — the previous turn's response. The
   interface-level yes/no routing
   (`shell/plugins/src/message-interface/confirmation-routing.ts`)
   guards the common confirmation replies, but any other message mid-
   confirmation (topic change, clarifying question, second user) hits
   the replay path. The service API itself misbehaves; interfaces only
   make it rarer.

Related lifecycle gap: `conversationActors`
(`agent-service.ts:244,360-364`) grows one started actor per
conversation forever — only test-only `resetInstance` stops them — and
each actor's context retains the last turn's `ChatAttachment[]`,
including raw `Uint8Array` upload bytes. Long-running brains accumulate
actors and buffers without bound. It is the same design question
(when may a conversation's machine die?), so it lands in this plan.

## Goal

Every message sent to `chat()` is either processed exactly once, in
arrival order, with its own response — or rejected with an explicit
error the caller can surface. Nothing is silently dropped, no caller
ever receives another turn's response, and idle conversation actors
are evicted.

## Non-goals

- Interrupt/cancel semantics for in-flight turns (a "stop" command is
  a different feature; the queue decision does not preclude it later).
- Parallel turn execution within one conversation. One turn at a time
  per conversation is deliberate — history consistency depends on it.
- Cross-conversation scheduling or fairness. Actors are already
  per-conversation; global throughput is untouched.
- Changing the confirmation card/action protocol that interfaces use.

## Decisions

### 1. Queue mid-turn messages, bounded, drain in order

The machine (or a thin service-side wrapper around `actor.send` —
implementor's choice, whichever keeps the machine testable) maintains a
FIFO of pending messages per conversation:

- `chat()` during `processing` enqueues instead of firing a dropped
  event. Each queued entry carries its own promise; callers resolve
  with **their** turn's response, not a shared snapshot read.
- After a turn completes (either to `idle` or after confirmation
  resolution), the queue drains: next message starts a new turn with
  the conversation history as it now stands.
- Bound: 10 messages per conversation. Enqueue beyond the bound
  rejects with an explicit "conversation is busy" error the interfaces
  can render. A bound this small never triggers in real chat; it
  exists so a runaway caller cannot buffer unbounded attachments.

### 2. A non-confirmation message during `awaitingConfirmation` is an implicit "no"

When a message arrives in `awaitingConfirmation` and is not a
confirmation response, the pending action is cancelled exactly as an
explicit decline would be (same `CANCEL` event, same audit/logging
path), and the new message is then processed as a normal turn. Matches
human expectations: ignoring "are you sure?" and saying something else
means no.

Three qualifications that make this safe:

- **The service classifies, not just the interfaces.** Interface-level
  `routeConfirmationResponse` keeps pre-routing explicit yes/no, but
  the service cannot assume every caller ran it (A2A and future
  interfaces don't). Before treating a message as an implicit decline,
  the service runs the same yes/no classification
  (`parseConfirmationResponse` in shell/plugins is the existing logic;
  hoist or share it) as a fallback — a plain "yes" arriving
  unclassified confirms, it does not decline-then-rerun.
- **Implicit decline requires decline authority.** The same actor
  check that gates explicit CONFIRM/CANCEL
  (`canConfirmPendingAction`) gates the implicit path. A message from
  an actor who could not cancel the pending action does not touch it —
  it queues behind the confirmation (bounded by the existing
  confirmation timeout), so a bystander chatting in the channel cannot
  kill the anchor's pending action.
- **Queue drain applies the same rule.** If a turn ends by asking a
  confirmation and the queue already holds a message (typed before the
  question was shown), draining it follows this decision: authorized →
  implicit decline and process; unauthorized → hold until the
  confirmation resolves or times out. The queue never stalls for an
  actor who has the authority to move the conversation on; if they
  wanted the action, they re-trigger it.

### 3. `waitFor` keyed to the caller's turn, not to machine state

The root of the stale replay is resolving on "machine reached
`idle|awaitingConfirmation`" — a predicate satisfiable by someone
else's turn. Each turn gets an id; `chat()` resolves when **its**
turn's completion is recorded (per-turn promise from decision 1). Both
state-predicate `waitFor`s go away — the one in `chat()`
(`agent-service.ts:410`) and the one in the confirmation-resolution
path (`agent-service.ts:493`), which has the same
someone-else's-turn exposure.

### 4. Idle actor eviction

An actor whose machine is `idle`, whose queue is empty, and which has
seen no message for the eviction window (default 30 minutes,
configurable alongside existing ai-service config) is stopped and
removed from `conversationActors`. Recreating an actor on the next
message is already the code path for a fresh conversation, so eviction
is invisible to users — history lives in conversation-service, not in
the actor. Actors in `awaitingConfirmation` are not evicted before the
existing confirmation timeout resolves them. Attachment buffers die
with the actor; additionally, clear `context.attachments` when a turn
completes — they are only meaningful during the turn that carried
them.

## Phases

Each phase lands green in isolation (ai-service tests, typecheck,
lint), tests written before implementation.

### Phase 1 — per-turn resolution (walking skeleton)

Turn ids + per-turn promises; `chat()` resolves with its own turn's
response; the state-predicate `waitFor` is removed. Failing tests
first: two concurrent `chat()` calls must yield two distinct responses
(this test reproduces today's drop), and a `chat()` during
`awaitingConfirmation` must not return the prior response.

### Phase 2 — queue and drain

Bounded FIFO, drain on turn completion, "busy" rejection at the bound.
Tests: ordering under burst, per-caller responses, bound rejection,
queue survives a turn that errors.

### Phase 3 — implicit decline

Non-confirmation message in `awaitingConfirmation` cancels the pending
action then processes the message, per decision 2's qualifications.
Tests at the service level: topic-change from the confirming actor
cancels and answers; an unclassified plain "yes" confirms (service
fallback classification); a message from an unauthorized actor leaves
the pending action untouched and queues; queue drain into a fresh
confirmation declines for the authorized sender. Plus one
interface-level test (chat harness) proving the end-to-end
topic-change path.

### Phase 4 — actor eviction and attachment hygiene

Idle-TTL eviction sweep (unref'd timer, cleared on shutdown), clear
attachments on turn completion, config knob. Tests: eviction after
TTL, no eviction while `awaitingConfirmation` or queue non-empty,
attachments absent from context after completion, evicted conversation
continues correctly on next message.

## Verification

1. Two rapid messages to the same conversation produce two turns, two
   distinct persisted exchanges, and each caller gets its own response
   — across service-level tests and at least one real interface path.
2. A message during a pending confirmation from an actor with decline
   authority cancels the action (audit log shows a decline) and is
   then answered normally; the same message from a bystander leaves
   the confirmation pending; an unclassified "yes" from a
   routing-less interface confirms instead of declining.
3. The 11th queued message is rejected with the explicit busy error;
   the first 10 all complete.
4. A brain left running with many one-off conversations holds only
   actors touched within the eviction window; heap does not retain
   upload buffers after turns complete.
5. `shell/ai-service` tests, typecheck, lint green; no interface test
   regressions.

## Related

- `shell/plugins/src/message-interface/confirmation-routing.ts` —
  yes/no pre-routing stays; decision 2 handles what it doesn't catch.
- `docs/plans/chat-message-interface-shared-workflows.md` — interface
  message flow; this plan changes only the service beneath it.
