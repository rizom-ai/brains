# Plan: Studio Chat workspace split

## Status

**Active.** Nothing has shipped yet. Slice 1 is next.

## Goal

`plugins/studio/ui-react/src/studio-chat-workspace.tsx` is 2133 lines: a 1122-line container at cyclomatic complexity 52, then eight presentational components and two helpers in the same file. It is the largest remaining file in the Studio package after the September 2026 container work on `App.tsx`.

This applies the same two-part treatment that worked there: move the presentation into its own modules, then give each container concern a hook with explicit inputs and its own tests. `StudioChatWorkspace` ends as composition plus render.

No behaviour changes. Every slice must leave `studio-chat-workspace.test.tsx` (33 tests against the real component) passing unchanged.

## Current baseline

| Concern          | Where it lives today                                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Draft            | `draftStore`, `draftKey`, `setDraft`, `setUploads`, and the two `onNavigationStateChange` effects                                                                                |
| Sessions         | `sessionSearch`, `sessionView`, the 250ms debounce effect, `sessionsQuery`, `currentSession`, `sessionControls`, `navigateToSession`                                             |
| Thread scrolling | `threadEndRef`, `threadScrollRef`, `followLatestRef`, `showJumpToLatest`, and three effects including a `ResizeObserver`                                                         |
| Streaming        | `runStream`, `submitPrompt`, `respondToApproval`, `runSuggestedAction`, `stream`, `sending`, `interrupted`, `activeStreamRef`                                                    |
| Uploads          | `runUploads`, `uploadFiles`, `uploadAttempts`, `uploadBatchRef`, `uploading`                                                                                                     |
| Handoff          | the effect that opens a context session and adopts the draft under the new conversation id                                                                                       |
| Archive          | `archiveCurrent`                                                                                                                                                                 |
| Reset            | the effect that aborts the active stream and clears every per-conversation value when `sessionId` changes                                                                        |
| Presentation     | `SessionRail`, `ChatEmptyState`, `ChatTurn`, `MessageCard`, `ApprovalCard`, `Composer`, `DraftUploadPreview`, `ConversationContext`, plus `formatSessionTime` and `errorMessage` |

`chat-workspace-model.ts` already owns the stream reducer (`reduceStudioChatStream`, `streamAssistantMessage`, `approvalResponseMessage`); the streaming hook builds on it rather than replacing it.

## Non-goals

- No change to what Studio Chat renders or when.
- No context provider. Hooks take explicit inputs, as in the `App.tsx` work, so the data flow stays readable in the component.
- The chat protocol client, the draft store and the stream reducer keep their current contracts.

## Architecture decisions

1. **Presentation first.** The eight components are pure and already parameterised; moving them is mechanical and removes 875 lines before any stateful work begins, which makes the container's remaining shape obvious.
2. **One hook per concern.** `useChatSessions`, `useChatThreadScroll`, `useChatStream`, `useChatUploads`. Each in its own file, exporting its input and output types.
3. **Abort stays a ref, owned by the streaming hook.** `activeStreamRef` must be readable synchronously from async continuations and from the reset effect. It is not exposed; the hook offers `abortActiveStream()` so the reset path is a call rather than a reach into a ref, the same shape `useEntityOpener` settled on.
4. **The reset effect stays in the component.** It spans every concern by design — one route change clears drafts, stream, uploads and errors together. Each hook exposes its own `reset()` and the component calls them in one effect, so the ordering stays visible in one place.
5. **Behaviour-preserving slices, one PR each**, tests before the hook.

## Slices

Each slice is one PR.

1. **Presentation.** Move `SessionRail`, `ChatEmptyState`, `ChatTurn`, `MessageCard`, `ApprovalCard`, `Composer`, `DraftUploadPreview`, `ConversationContext` and the two helpers into modules grouped by what they render: the rail, the thread, the composer, the context panel. JSX unchanged.
2. **`useChatSessions`.** The session list query, search debounce, view state, `currentSession` resolution and `navigateToSession`. Tests: the debounce collapses rapid typing into one view change and resets the offset; a session missing from the current page is still resolved from other cached pages; navigation closes the picker and details.
3. **`useChatThreadScroll`.** The follow-latest behaviour and its `ResizeObserver`. Tests: growth scrolls to the bottom while following; scrolling up stops following and raises the jump-to-latest affordance; a session change restores following.
4. **`useChatStream`.** `runStream` and its callers, the interrupted-response record, and `abortActiveStream`. Tests: a completed stream replaces the optimistic pending copy; a server stop records an interrupted response with its retry; a second send aborts the first; `abortActiveStream` leaves no dispatch behind.
5. **`useChatUploads`.** The upload batch, its attempts and their failures. Tests: a batch that is superseded records nothing; a failed upload keeps its attempt visible with the failure.
6. **Compose.** The handoff and archive callbacks move to whichever hook now owns their state, and the component keeps the reset effect, the hook calls and the render.

## Validation

- Per slice: `turbo run test --filter @brains/studio`, `turbo run typecheck --filter @brains/studio`, `bun scripts/lint.mjs --force --filter @brains/studio`, both format lanes, `bun run changeset:check`.
- After slice 6: `StudioChatWorkspace` is composition and render only, and no file in `plugins/studio/ui-react/src` exceeds 700 lines.

## Risks and mitigations

- **Abort and reset are entangled.** The reset effect aborts the stream and clears five other concerns. Slice 4 introduces `abortActiveStream()` before slice 6 moves the reset, so the component never reaches into a hook's ref.
- **The handoff effect writes another hook's state.** It sets the draft, clears the error and navigates. Slice 6 places it after the hooks it depends on rather than splitting it across two.
- **Scroll behaviour is DOM-timing sensitive.** Slice 3's tests drive a real `ResizeObserver` under happy-dom rather than asserting on refs.

## Success criteria

- `studio-chat-workspace.tsx` is the component and its render, with presentation and stateful concerns in named modules.
- Every moved concern has hook-level tests that fail without the behaviour they name.
- The 33 existing workspace tests pass unchanged after each slice.

## Related plans

- [studio-ux-improvements.md](./studio-ux-improvements.md) owns the remaining presentation decisions this plan must not pre-empt.
