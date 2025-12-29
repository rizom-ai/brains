# Agent Interaction UX Improvements - Test-First Plan

## Overview

Three improvements to agent interaction UX, implemented with **tests first**:

1. **Tool Invocation Status** - Show tool names during execution
2. **Async Job Feedback** - Update agent responses with job completion
3. **Improved Confirmation** - Shared utility with more input options

---

## Phase 1: Confirmation Handler (Foundation)

### Test Specification

**File:** `shell/plugins/test/message-interface/confirmation-handler.test.ts`

```typescript
describe("parseConfirmationResponse", () => {
  // Positive: "yes", "y", "ok", "sure", "proceed", "confirm"
  // Negative: "no", "n", "cancel", "abort", "stop"
  // Edge: whitespace trimming, case-insensitive, undefined for unrecognized
});

describe("formatConfirmationPrompt", () => {
  // Includes action description and help text
});

describe("ConfirmationTracker", () => {
  // setPending, getPending, clearPending, isPending
});
```

### Implementation

**New file:** `shell/plugins/src/message-interface/confirmation-handler.ts`

```typescript
export function parseConfirmationResponse(
  input: string,
): { confirmed: boolean } | undefined;
export function formatConfirmationPrompt(description: string): string;
export class ConfirmationTracker {
  setPending(conversationId: string, confirmation: PendingConfirmation): void;
  getPending(conversationId: string): PendingConfirmation | undefined;
  clearPending(conversationId: string): void;
  isPending(conversationId: string): boolean;
}
```

**Update:** `interfaces/cli/src/cli-interface.ts` and `interfaces/matrix/src/lib/matrix-interface.ts`

- Replace inline confirmation parsing with shared `parseConfirmationResponse()`
- Use `ConfirmationTracker` instead of local state
- Show help text for unrecognized responses

---

## Phase 2: Tool Invocation Events

### Test Specification

**File:** `shell/agent-service/test/tool-invocation-events.test.ts`

```typescript
describe("tool invocation events", () => {
  it("should emit tool:invoking event before handler executes");
  it("should emit tool:completed event after handler returns");
  it("should emit tool:failed event when handler throws");
  it(
    "should include contextInfo for routing (conversationId, channelId, interfaceType)",
  );
});
```

**File:** `shell/plugins/test/message-interface/tool-status.test.ts`

```typescript
describe("MessageInterfacePlugin tool status", () => {
  it("should subscribe to tool:invoking and tool:completed channels");
  it("should track active tool invocations");
  it("should notify UI callback when tool starts/completes");
});
```

### Implementation

**Modify:** `shell/agent-service/src/brain-agent.ts`

```typescript
// Add to BrainAgentFactoryOptions
messageBus?: IMessageBus;

// In convertToSDKTools(), wrap execute:
execute: async (args) => {
  messageBus?.send("tool:invoking", { toolName, args, ...contextInfo }, "brain-agent");
  try {
    const result = await t.handler(args, context);
    messageBus?.send("tool:completed", { toolName, ...contextInfo }, "brain-agent");
    return result;
  } catch (error) {
    messageBus?.send("tool:failed", { toolName, error, ...contextInfo }, "brain-agent");
    throw error;
  }
}
```

**Modify:** `shell/agent-service/src/types.ts`

```typescript
export interface ToolInvocationEvent {
  toolName: string;
  args?: unknown;
  conversationId: string;
  channelId?: string;
  interfaceType: string;
}

export interface ToolCompletionEvent extends ToolInvocationEvent {
  duration?: number;
  error?: string;
}
```

**Modify:** `shell/core/src/initialization/shellInitializer.ts`

- Pass `messageBus` to `createBrainAgentFactory()` call (around line 421)

**Modify:** `shell/plugins/src/message-interface/message-interface-plugin.ts`

- Subscribe to `tool:invoking` and `tool:completed` channels
- Add `toolStatusCallback` for UI updates
- Track active tools for spinner/status display

---

## Phase 3: Async Job Feedback (Enhancement)

### Test Specification

**File:** `shell/plugins/test/message-interface/job-tracking.test.ts`

```typescript
describe("job tracking", () => {
  it("should extract jobIds from toolResults");
  it("should call trackAgentResponseForJob for each jobId");
  it("should update message when job completes");
});
```

### Implementation

**Already exists** in `MessageInterfacePlugin`:

- `trackAgentResponseForJob()` (lines 175-190)
- `agentResponseTracking` Map (line 145)
- Completion handling in `handleProgressEvent()` (lines 316-350)

**Need to add:** CLI integration

- Call `trackAgentResponseForJob()` after sending agent response
- Currently only Matrix does this

---

## Files to Modify

| Phase | File                                                                | Change                           |
| ----- | ------------------------------------------------------------------- | -------------------------------- |
| 1     | `shell/plugins/src/message-interface/confirmation-handler.ts`       | **NEW** - shared utility         |
| 1     | `shell/plugins/test/message-interface/confirmation-handler.test.ts` | **NEW** - tests first            |
| 1     | `shell/plugins/src/message-interface/index.ts`                      | Export confirmation handler      |
| 1     | `interfaces/cli/src/cli-interface.ts`                               | Use shared confirmation handler  |
| 1     | `interfaces/matrix/src/lib/matrix-interface.ts`                     | Use shared confirmation handler  |
| 2     | `shell/agent-service/test/tool-invocation-events.test.ts`           | **NEW** - tests first            |
| 2     | `shell/agent-service/src/brain-agent.ts`                            | Add MessageBus, emit tool events |
| 2     | `shell/agent-service/src/types.ts`                                  | Add ToolInvocationEvent types    |
| 2     | `shell/core/src/initialization/shellInitializer.ts`                 | Pass MessageBus to agent factory |
| 2     | `shell/plugins/test/message-interface/tool-status.test.ts`          | **NEW** - tests first            |
| 2     | `shell/plugins/src/message-interface/message-interface-plugin.ts`   | Subscribe to tool events         |
| 3     | `shell/plugins/test/message-interface/job-tracking.test.ts`         | **NEW** - tests first            |
| 3     | `interfaces/cli/src/cli-interface.ts`                               | Add job tracking                 |

---

## Implementation Order

1. **Phase 1** - Confirmation handler (foundation, no dependencies)
   - Write tests → Implement → Update CLI → Update Matrix → Verify

2. **Phase 2** - Tool invocation events (builds on MessageBus)
   - Write brain-agent tests → Implement events → Write plugin tests → Implement subscription

3. **Phase 3** - Job feedback (validates existing + adds CLI)
   - Write job tracking tests → Verify Matrix works → Add to CLI

---

## Verification

After each phase:

```bash
bun run typecheck
bun test shell/plugins
bun test shell/agent-service
bun run lint:fix
```

Manual testing:

- CLI: Spinner shows tool names during execution
- CLI/Matrix: Confirmation accepts "ok", "sure", "cancel", etc.
- CLI/Matrix: Unrecognized confirmation input shows help text
