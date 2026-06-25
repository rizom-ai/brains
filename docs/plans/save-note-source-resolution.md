# Source resolution for `system_create` save-note flows

## Status

Planning doc. Current `main` already includes the first core implementation:

- `system_create` accepts `from: { kind: "conversation-message", messageId?: string }`.
- Core resolves that ref to stored assistant-message content.
- Resolved content is frozen into confirmation args so confirmation cannot drift.
- `isSavableAssistantMessage` lives in `conversation-service` and filters out approval cards, upload-intent cards, entity-memory turns, empty messages, and non-assistant messages.
- Fake placeholder IDs such as `latest`, `:latest`, `current`, `:current`, and path-like `.../latest` / `.../current` are normalized to omitted, meaning “latest savable assistant message”.
- The previous call-options experiment (`enableCreateConversationMessageSource` / per-turn NL guidance) has been reverted; `from` is currently part of the normal model-visible `system_create` schema.

Implementation progress in this branch:

- Phase 0 is implemented: current guidance now routes source-derived artifact saves through `sourceAttachment`, not `from`.
- Phase 1 is implemented: `system_create` rejects `from: { kind: "conversation-message" }` when combined with another source field, and direct `content` creates do not inspect conversation messages.
- Phase 2 is implemented: upload-ref hints now distinguish raw-upload saves from prior-assistant-response note saves and name `from: { kind: "conversation-message" }` instead of copied conversation content.

Known remaining issue:

- The eval `multi-turn-web-chat-pdf-summary-save-it-note` should be rerun to verify the Phase 2 routing-hint cleanup is sufficient. If it remains flaky, continue to Phase 3 before considering the Phase 4 runtime shortcut.

## Problem

`system_create` currently exposes several sibling source fields:

- `content`
- `prompt`
- `url`
- `upload`
- `sourceAttachment`
- `from`

The model must choose which source to use. Two save-note cases are easy to conflate:

1. **Inline current user text**

   User says:

   > Save this first idea: resilient software is a climate strategy...

   Correct source: `content` containing the user-provided idea.

   Incorrect model behavior observed:

   ```json
   {
     "entityType": "note",
     "content": "resilient software is a climate strategy...",
     "from": { "kind": "conversation-message", "messageId": "/messages/auto" }
   }
   ```

   Safety requirement: never silently discard the user-provided content because a bad `from` was also present.

2. **Prior assistant response**

   Assistant summarizes/describes/analyzes something. User then says:

   > can you save it

   Correct source: `from: { kind: "conversation-message" }`, resolved by core to the latest savable assistant message.

   Incorrect model behavior observed: asks for an upload ref or tries to save the raw upload instead of saving the visible assistant summary as a note.

## Design principles

1. **Separate interpretation from resolution.**
   - Reference interpretation (`it` → prior assistant summary vs raw upload vs user text) is linguistic and may involve the model.
   - Source resolution (`from` → stored assistant bytes) must be deterministic and server-side.

2. **Fail closed.**
   - If a prior assistant message cannot be resolved, do not substitute uploads, retrieved entities, or generated text.
   - Unknown concrete `messageId`s should fail. Only known placeholder IDs should normalize to omitted/latest.

3. **Preserve compatibility.**
   - Do not break external callers that already use flat `system_create` args (`content`, `prompt`, `url`, etc.).
   - Prefer adding a clearer `source` shape for model-visible use while continuing to accept legacy flat input.

4. **Confirmation flow stays authoritative.**
   - Initial write calls still return confirmation.
   - Confirmation args must contain frozen concrete `content`, not a live `from` reference.

5. **No new tool.**
   - All changes remain within `system_create` / agent routing.

## Proposed plan

### Phase 0 — fix current `from` / `sourceAttachment` guidance

Goal: remove the live contradiction before changing source-resolution behavior.

Context: today `system_create` has two separate source concepts:

- `from: { kind: "conversation-message", messageId?: string }` means “save a prior assistant response”.
- `sourceAttachment` means “create from an existing entity artifact” such as a deck carousel PDF, printable PDF, or OG/social-preview image.

Current guidance in a few places incorrectly says source-derived artifacts use `from`. That is wrong for the current flat schema and adds routing pressure in the opposite direction of this plan.

Tests/validation:

- Update or add a targeted assertion that current system/document guidance names `sourceAttachment` for durable source-derived artifacts.
- Assert that guidance no longer says durable deck carousel/printable/OG artifact saves use `from`.

Implementation:

- Update `../core/src/system/instructions.ts` so source-derived artifact saves say `sourceAttachment`, not `from`.
- Update `../../entities/document/src/tools/index.ts` so durable document requests prefer `system_create` with `sourceAttachment`, not `from`.
- Search for stale phrases such as `system_create ... and from` or `source-derived ... from` and fix only the current-schema guidance, not historical changelog text.

Exit criterion: model-visible guidance is internally consistent: `from` is only for prior assistant/conversation-message saves, while source-derived artifacts use `sourceAttachment` until Phase 3 replaces the model-visible flat fields with `source`.

### Phase 1 — tighten core safety for conflicting sources

Goal: prevent silent data loss and make bad mixed-source calls fail predictably.

Urgency: since the call-options revert put `from` back in the normal
model-visible schema, case 1a (silent discard of user-provided `content` when a
bad `from` is also present) is a **live footgun on `main` today**. This is the
safety fix, not cleanup — it lands first.

Exit criterion: the mixed-source rejection tests below pass and
`tool-invocation-system-create-note` stays green. This phase does **not** make
`multi-turn-web-chat-pdf-summary-save-it-note` pass (that is Phase 2/3).

Tests first:

- `system_create({ entityType: "note", content, from })` rejects with a clear error and does not create an entity.
- `system_create({ entityType: "note", prompt, from })` rejects.
- `system_create({ entityType: "note", url, from })` rejects.
- `system_create({ entityType: "note", upload, from })` rejects.
- `system_create({ entityType: "note", sourceAttachment, from })` rejects.
- `system_create({ entityType: "note", content })` succeeds and does not call `conversationService.getMessages`.
- `system_create({ entityType: "note", from: { kind: "conversation-message" } })` still resolves latest savable assistant content and freezes confirmation args.

Implementation:

- Add schema or handler validation rejecting `from: conversation-message` combined with any other source field. Run this validation before source resolution or canonicalization lookups, so invalid mixed input has no side effects.
- Remove silent precedence behavior in `normalizeCreateSource` where `conversationMessageRef` causes `content`/`prompt`/`url` to be dropped.
- Keep existing placeholder normalization, but narrow it:
  - normalize only explicit placeholders → omitted/latest. The set is decided,
    not "maybe": `latest`, `:latest`, `current`, `:current`, path-like
    latest/current, **and** `auto` / `/messages/auto`. These are obvious model
    placeholders, never real stored IDs; erroring on them would surface a
    confusing failure for a common model habit.
  - unknown concrete IDs fail (do not silently resolve to latest).

This phase does not guarantee the PDF-summary eval passes, but it makes the inline-text bug safe.

### Phase 2 — clean up upload/save-it routing pressure

Goal: stop pushing “save it” after a summary toward raw upload refs.

Tests first (assert structure, not verbatim prose — exact hint strings are brittle):

- In `conversation-messages.test.ts`, when prior upload refs are visible and the previous assistant turn summarized/described/analyzed the upload, the upload-ref hint must contain **both** routing paths, structurally keyed:
  - a raw-upload path (“save the PDF/file/upload” → raw upload save)
  - a prior-response path (“save it/that/the summary/the note”) that names `from: { kind: "conversation-message" }`
- Assert the prior-response path references `from: { kind: "conversation-message" }` and does **not** tell the model to copy “content from the conversation”. Match on the structural token, not the surrounding sentence.

Implementation:

- Update `formatUploadRefs` prose to match current core behavior.
- Remove stale language that says to create notes with copied conversation `content` for prior assistant summaries.
- Keep raw upload refs passive unless the user explicitly asks to act on the uploaded file itself.

This is still routing guidance, not a deterministic guarantee, but it addresses the known failing eval’s pressure toward upload refs.

Exit criterion: `multi-turn-web-chat-pdf-summary-save-it-note` and `multi-turn-web-chat-image-discussion-save-note` should improve and ideally pass. If they remain flaky after Phase 3 makes the model-visible schema source-only, escalate to Phase 4.

### Phase 3 — add a preferred `source` discriminated union without breaking flat input

Goal: make source selection clearer for the model and make illegal combinations unrepresentable in the preferred shape.

Preferred model-visible shape:

```ts
source:
  | { kind: "text"; content: string }
  | { kind: "generate"; prompt: string }
  | { kind: "url"; url: string }
  | { kind: "upload"; upload: { kind: "upload"; id: string }; transform: "extract-markdown" }
  | { kind: "attachment"; sourceEntityType: string; sourceEntityId: string; attachmentType: string }
  | { kind: "prior-response"; messageId?: string }
```

Compatibility rule — split the layers:

- **Handler/contract layer** continues to _accept_ flat args (`content`, `prompt`, `url`, `upload`, `sourceAttachment`, `from`) for MCP/CLI/external callers. Legacy compatibility lives here.
- **Model-visible SDK schema exposes `source` only** — this is part of Phase 3's definition of done, not a deferred "consider later." Showing the model both `content` _and_ `source:{kind:"text",content}` would add a second way to express the same intent and _increase_ the conflation Phase 3 exists to remove. The model picks one labeled `source` branch; the flat fields are an inbound-compatibility detail it never sees.
- Handler translates `source` → the existing internal flat `CreateInput` before interceptors run, so plugin contracts are untouched.

Tests first:

- Schema accepts each `source` branch.
- Schema rejects cross-branch combinations inside `source`.
- Model-visible SDK schema (`toModelVisibleInputSchema`) exposes `source` and does **not** expose the legacy flat source fields.
- Handler still _accepts_ legacy flat args (non-model callers): a flat `{ content }` and a flat `{ from }` both succeed.
- If both `source` and legacy source fields are present, reject (no implicit precedence) to avoid ambiguity.
- Interceptors still receive the same flat `CreateInput` shape as today.

Exit criterion: model-visible schema is source-only; all legacy-flat handler tests still pass; the two save-it evals pass without invoking Phase 4.

### Phase 4 — decide whether a deterministic runtime shortcut is needed

Goal: determine if model routing is good enough after Phases 1–3.

If the PDF-summary save-it eval still fails, consider a narrow agent-runtime shortcut before model generation. This is keyword intent-routing — the thing the original brief was skeptical of — so it is fenced as last-resort and must satisfy both a placement and a firing constraint:

Placement (non-negotiable):

- The shortcut lives in the **shared chat/agent path** used by all agent-backed interfaces, not in web-chat preprocessing. If it cannot be placed at that shared chokepoint, it is not built — an interface-specific shortcut re-creates the cross-interface divergence this whole plan exists to remove. Direct MCP tool calls are out of scope because they invoke tools explicitly rather than asking the agent to interpret chat intent.

Firing conditions (all must hold):

- User message structurally matches a save-prior-assistant request (`save it`, `save that`, `save your answer`, `save the summary`, etc.).
- The previous savable assistant message exists (`isSavableAssistantMessage`).
- Active upload refs do **not** block this shortcut by themselves. The failing eval has an active prior PDF upload, and the desired behavior is still to save the visible assistant summary as a note.
- If active upload refs exist, gate structurally rather than by content-sniffing the prose: the most-recent savable assistant turn must be causally tied to an upload-bearing user/request turn by stored attachment metadata, upload-continuity metadata, or turn ordering, **or** the user must explicitly name prior assistant content (`your answer`, `the summary`, `that response`, etc.). This keeps the condition deterministic and unit-testable, and prevents unrelated historical uploads from biasing ordinary note saves.
- The user must not explicitly target the raw file/upload itself with words like `upload`, `file`, `PDF`, `document`, `image`, `attachment`, `import`, `promote`, or `save the file/PDF/document`.

Action:

- Invoke the existing `system_create` handler with:

  ```json
  {
    "entityType": "note",
    "from": { "kind": "conversation-message" }
  }
  ```

- Return the normal confirmation response/cards.

Caution:

- This is deterministic for a narrow pattern, but it is still intent routing. Keep it small, tested, and cross-interface.
- Do not implement this until after the safer schema/source cleanup unless the eval remains stubbornly flaky.

## Required evals

- `multi-turn-rover-onboarding-playbook`
  - Inline first seed must save via direct `content`, not `from`.
- `multi-turn-web-chat-pdf-summary-save-it-note`
  - After PDF summary, “can you save it” should call `system_create` for `note` from prior assistant response, not raw upload.
- `multi-turn-web-chat-image-discussion-save-note`
  - Image discussion save should save prior assistant discussion as note and preserve confirmation flow.
- `tool-invocation-system-create-note`
  - Direct note creation remains compatible across permission levels.

## Compatibility risks

- Rejecting mixed source fields can turn previously “best effort” bad calls into explicit errors. This is acceptable for safety but may require model-routing eval updates.
- The `source` union does not increase model-visible schema size, because Phase 3 makes the model-visible schema source-only; legacy flat fields remain accepted at the handler layer but are hidden from the model. The transition window (Phase 1–2 ship before Phase 3) is the only time both are model-visible.
- Existing plugin interceptors must continue receiving flat `CreateInput`; do not push the union into entity-service/plugin contracts yet.
- Unknown concrete message IDs must not silently resolve to latest; this may expose prior model mistakes as errors, which is preferable to saving the wrong content.

## Out of scope

- Adding a new save-last-response tool.
- UI/web-chat-only fixes.
- Output stripping of internal content.
- Changing the definition of savable assistant messages except via explicit tests and review.
