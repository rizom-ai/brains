# Plan: confirmation result integrity

## Status

Proposed. Fix misleading assistant output around destructive-action confirmations.

## Problem

Observed in web chat:

1. User asked to delete a note.
2. Assistant displayed: `Deleted.`
3. A confirmation card appeared.
4. After approval, the actual result was:

```json
{ "success": false, "error": "Entity not found: base/woodchuck-note" }
```

This is confusing and unsafe. The assistant text implied the destructive action
had already succeeded, while the confirmed action later failed.

The delete tool itself appears designed correctly:

```text
shell/core/src/system/entity-delete-tool.ts
```

It returns a pending confirmation first and only deletes after confirmation with
a confirmation token.

The likely issue is in the shared agent confirmation flow: model text is being
saved/returned as a final assistant response even when the same turn produced a
pending confirmation.

## Responsible package

Primary:

```text
shell/ai-service
```

Relevant files:

```text
shell/ai-service/src/agent-service.ts
shell/ai-service/src/agent-results.ts
shell/core/src/system/entity-delete-tool.ts
```

Secondary UI follow-up:

```text
interfaces/web-chat
```

## Goals

- Do not display or persist misleading completion text before a pending action is
  confirmed.
- Make the confirmation approval result the source of truth for whether the
  action succeeded or failed.
- Fix this in shared agent-service behavior so Discord, chat-repl, web-chat, and
  other interfaces benefit.
- Keep the delete tool's confirmation-token behavior intact.

## Non-goals

- Redesigning the whole confirmation protocol.
- Making destructive tools execute before confirmation.
- Solving all UI rendering polish for tool failures in this pass.

## Proposed fix

In `AgentService.processMessage`:

1. Call the model.
2. Extract tool results and pending confirmation from the result steps.
3. If `pendingConfirmation` exists, do **not** treat `result.text` as final
   assistant completion text.
4. Save/return a neutral message instead, for example:

```text
Confirmation required.
```

or avoid saving assistant text for that turn if interfaces already render the
pending confirmation card/message.

Then `AgentService.executeConfirmedAction` remains responsible for saving and
returning the actual confirmed-action result.

## Validation

Add tests in `shell/ai-service` covering:

1. Model returns normal text plus pending confirmation.
   - Saved/returned assistant text must be neutral or omitted.
   - It must not save misleading text like `Deleted.`.
2. Confirmed action succeeds.
   - Actual success result is saved/returned by `executeConfirmedAction`.
3. Confirmed action fails.
   - Actual failure is surfaced accurately.
4. Normal non-confirmation responses still save/return model text as before.

## Web UI follow-up

After the shared fix, improve `interfaces/web-chat` rendering so failed
confirmation/tool results are obvious instead of buried inside raw JSON.

For example, a failed confirmation result should render as an error state:

```text
Delete failed · Entity not found: base/woodchuck-note
```

rather than only showing a JSON blob inside the expanded tool result.
