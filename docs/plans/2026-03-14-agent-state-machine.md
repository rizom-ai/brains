# Agent State Machine with xstate

## Overview

Introduce xstate to model the AgentService's implicit states as an explicit state machine. This is a prerequisite for A2A task management — the A2A task lifecycle maps directly to agent states.

## Current Implicit States

AgentService currently manages state via flags and maps:

```
idle → processing chat → (calling tools → waiting for result)* → responded
         ↓
   pending confirmation → confirmed → executing tool → responded
                        → cancelled → responded
```

These states exist in code but aren't modeled explicitly — they're spread across:

- `chat()` method flow (processing)
- `pendingConfirmations` Map (confirmation flow)
- `agent.generate()` internals (tool loop)
- Conversation history persistence

## Proposed State Machine

```
┌──────────────────────────────────────────────────┐
│                     idle                         │
│  (waiting for message from any interface)        │
└──────────┬───────────────────────────────────────┘
           │ RECEIVE_MESSAGE
           ▼
┌──────────────────────────────────────────────────┐
│                  processing                       │
│  (agent is generating, possibly calling tools)    │
│                                                   │
│  ┌─────────┐    ┌──────────────┐                 │
│  │ thinking │───▶│ calling_tool │──┐              │
│  └─────────┘◀───└──────────────┘  │              │
│       ▲                            │              │
│       └────────────────────────────┘              │
└──────────┬──────────────┬────────────────────────┘
           │ RESPONSE      │ NEEDS_CONFIRMATION
           ▼               ▼
┌──────────────┐  ┌────────────────────────────────┐
│  responded   │  │     awaiting_confirmation       │
│  (idle)      │  │  (waiting for user yes/no)      │
└──────────────┘  └──────┬──────────────┬──────────┘
                         │ CONFIRM       │ CANCEL
                         ▼               ▼
                  ┌──────────────┐ ┌────────────┐
                  │  executing   │ │ cancelled  │
                  │  (tool run)  │ │ (idle)     │
                  └──────┬───────┘ └────────────┘
                         │ COMPLETE
                         ▼
                  ┌──────────────┐
                  │  responded   │
                  │  (idle)      │
                  └──────────────┘
```

## How A2A Maps to Agent States

| Agent State           | A2A Task State |
| --------------------- | -------------- |
| idle                  | (no task)      |
| processing            | working        |
| awaiting_confirmation | input-required |
| responded             | completed      |
| error                 | failed         |
| cancelled             | canceled       |

The A2A task manager becomes a thin wrapper — it creates a task, feeds the message to the agent state machine, and translates state transitions to A2A task status updates.

## Context (xstate)

```ts
interface AgentContext {
  conversationId: string;
  interfaceType: string;
  channelId: string;
  userPermissionLevel: UserPermissionLevel;
  message: string;
  response?: AgentResponse;
  pendingConfirmation?: PendingConfirmation;
  error?: string;
}
```

## Implementation Plan

### Step 1: Add xstate dependency

Add `xstate` to `@brains/ai-service`.

### Step 2: Define agent machine

Create `shell/ai-service/src/agent-machine.ts` — the state machine definition using xstate's `createMachine`. Pure definition, no side effects.

### Step 3: Refactor AgentService to use the machine

Replace the implicit flow in `chat()` and `confirmPendingAction()` with machine interpretation. The external API stays identical — `chat()` still takes a message and returns `AgentResponse`. Internally, it sends events to the machine and awaits the final state.

### Step 4: Verify existing tests pass

The 71 existing tests cover all the behaviors. They should pass without changes since the external API is unchanged.

### Step 5: Wire A2A task manager

The A2A task manager subscribes to state transitions on the agent machine and maps them to A2A task status updates. This replaces the need for a separate task state machine.

## Key Decisions

- **Per-conversation machines**: Each conversation gets its own machine instance (already true — state is per-conversationId)
- **xstate v5**: Use the latest xstate (v5) with the new actor model
- **Machine is internal**: Only AgentService interacts with the machine. The public API doesn't expose xstate types.
- **Tests don't change**: The machine is an implementation detail. All 71 tests continue to test the public API.

## Files Changed

| File                                    | Change                                                 |
| --------------------------------------- | ------------------------------------------------------ |
| `shell/ai-service/package.json`         | Add `xstate` dependency                                |
| `shell/ai-service/src/agent-machine.ts` | New — state machine definition                         |
| `shell/ai-service/src/agent-service.ts` | Refactor to use machine internally                     |
| `shell/ai-service/test/*`               | No changes (tests verify behavior, not implementation) |

## Estimated Effort

~1 day. The state machine is straightforward, most work is wiring the existing logic into machine actions.
