# Plan: agent-service decomposition

## Status

Executing (started 2026-07-06). First of the four god-class
decompositions recorded in `codebase-cleanup-backlog.md`. Target:
`shell/ai-service/src/agent-service.ts` (~1245 lines), which mixes six
responsibilities: conversation-actor lifecycle + serialization,
chat/confirmation orchestration, a ~210-line `processMessage`,
attachment intake, confirmed-action execution, and metadata helpers.

## Goal

`AgentService` stays the façade implementing `IAgentService` (public
API unchanged: `chat`, `confirmPendingAction`, `invalidateAgent`,
instance management). Internals move to focused, unit-testable
collaborators inside the same package. No new packages, no export
surface changes.

## Non-goals

- No behavior changes. Every phase must keep the existing
  `agent-service.test.ts` suite green unmodified (it is the behavioral
  contract).
- No changes to `agent-machine.ts` (the xstate machine is already a
  clean unit).
- No cross-package moves.

## Decisions

1. **Collaborators are package-internal.** Not exported from the
   package index; tests import them directly by path.
2. **The registry is xstate-free.** `ConversationActorRegistry` is
   generic over a minimal actor contract (`stop()` plus an
   `isEvictable` callback); actor construction stays in AgentService
   via a `createActor` callback. This makes the registry testable with
   fake actors and keeps machine wiring in one place.
3. **Phases land independently.** Each phase: unit tests for the new
   collaborator first (TDD), then the extraction, package gates green,
   commit. No big-bang rewrite.

## Phases

### Phase 1 — ConversationActorRegistry (walking skeleton)

Extract the four maps (`conversationActors`, `conversationOperations`,
`conversationOperationCounts`, `conversationEvictionTimers`) and their
methods (`getConversationActor`, `clearConversationEvictionTimer`,
`scheduleConversationEviction`, `enqueueConversationOperation`) plus
`MAX_CONVERSATION_OPERATIONS` into
`src/conversation-actor-registry.ts` with API: `acquire`, `peek`,
`enqueue`, `scheduleEviction`, `dispose`. `resetInstance` uses
`dispose()`. Unit tests cover FIFO ordering, the busy bound, count
cleanup, TTL eviction (idle only, no pending ops), and dispose.

### Phase 2 — attachment intake

Move the module-level attachment helpers (`isImage/Pdf/TextAttachment`,
`buildAttachmentOnlyResponse`, `buildAttachmentOnlyActionsCard`,
`buildAsyncGenerationFallback`) and the instance methods
`filterLiveUploadRefs` / `hydrateUploadAttachments` into
`src/attachment-intake.ts` as pure functions (upload resolver passed
in). Unit tests first.

### Phase 3 — ConfirmationCoordinator

Move `runConfirmPendingAction`, `resolvePendingConfirmation`,
`resolveConfirmationContext`, `canConfirmPendingAction`, `actorKey`
into `src/confirmation-coordinator.ts`, collaborating with the
registry. AgentService.chat keeps only the parse/dispatch branch.

### Phase 4 — turn processing

Split `processMessage` (~210 lines): context assembly
(`fetchAgentContext` + instruction/message building) into
`src/turn-context.ts`; `executeConfirmedAction` +
`generatePostConfirmationFollowUp` into
`src/confirmed-action-executor.ts`. AgentService wires them into the
machine's `fromPromise` actors.

## Verification

Per phase: new unit tests pass, full `agent-service.test.ts` suite
passes unmodified, package typecheck/lint green. At the end: full-repo
gates + `arch:check`, and `agent-service.ts` reduced to the façade
(target under ~450 lines).
