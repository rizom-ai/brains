# Agent State Machine with xstate

## Status: In Progress

xstate v5 added, machine definition created, AgentService refactored. **69/71 tests pass.** 2 failures reveal a design problem with the confirmation flow that must be resolved before this can ship.

## What's Done

- `xstate@5.28.0` added to `@brains/ai-service`
- `agent-machine.ts` — state machine definition (idle → processing → awaitingConfirmation → executing → idle)
- `agent-service.ts` — refactored to use per-conversation machine actors
- `extractToolResults()` extracted as pure function
- Typecheck passes

## What's Broken: Confirmation Flow

### The problem

The current confirmation flow uses a **side-channel**: during tool execution, something calls `service.setPendingConfirmation()` which writes to a `Map`. Later, `confirmPendingAction()` reads from that Map.

The xstate machine models confirmation as a state (`awaitingConfirmation`). But `setPendingConfirmation()` writes to a Map _outside_ the machine — the machine never enters `awaitingConfirmation` because it doesn't know about the side-channel.

### 2 failing tests

1. **"should handle agent errors gracefully"** — test expects `chat()` to throw. Machine catches errors and returns an error response instead. This is actually better behavior (callers don't need try/catch), but the test asserts the old behavior.

2. **"should cancel pending confirmation when user declines"** — test calls `setPendingConfirmation()` then `confirmPendingAction(false)`. Machine is still in `idle` because `setPendingConfirmation()` doesn't transition it. Returns "No pending action to confirm."

### The right fix

Confirmation should flow through the machine, not around it. The tool handler should return a confirmation request as part of its result. The `processMessage` actor detects it, returns a response with `pendingConfirmation`, and the machine transitions to `awaitingConfirmation`.

This means:

1. Tool handlers that need confirmation return `{ needsConfirmation: true, description: "...", args: {...} }` instead of calling `setPendingConfirmation()` on the service
2. The `processMessage` actor checks the agent's tool results for confirmation requests
3. The machine transitions based on the response, not side effects
4. `setPendingConfirmation()` is removed from the public API

### Impact

- Changes to how tools request confirmation (tool handler return type)
- Any plugin that uses confirmation flow needs updating
- The agent needs to surface confirmation requests from tool results

## How A2A Maps to Agent States

| Agent State          | A2A Task State |
| -------------------- | -------------- |
| idle                 | (no task)      |
| processing           | working        |
| awaitingConfirmation | input-required |
| responded            | completed      |
| error                | failed         |
| cancelled            | canceled       |

## Next Steps

1. **Design the confirmation-via-return-value pattern** — how tools signal "needs confirmation"
2. **Update tool handler types** to support confirmation responses
3. **Update processMessage actor** to detect and surface confirmation requests
4. **Remove `setPendingConfirmation()`** from AgentService
5. **Fix the 2 failing tests** — update to match new behavior
6. **Fix lint issues** (6 remaining: return types, non-null assertion, unnecessary conditionals)
7. **Wire A2A task manager** to agent machine state transitions
