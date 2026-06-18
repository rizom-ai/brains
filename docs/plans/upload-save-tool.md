# System upload-save tool

## Status

Proposed.

## Problem

Raw uploaded file persistence is currently mixed into `system_create`. That makes follow-up intent ambiguous for models: after an upload is summarized or described, a later request like “save it” can be interpreted as raw upload promotion instead of saving the visible assistant summary/notes.

Upload access is also a structural runtime concern: only live, conversation-scoped upload refs should be actionable. Old upload metadata should not keep raw file promotion available after the conversation has moved on.

## Proposal

Add one system-level durable-write tool for raw upload preservation:

```ts
system_upload_save({
  upload: { kind: "upload", id: "..." },
  title?: string,
})
```

The tool should:

- require the same confirmation flow as other durable writes;
- validate that the upload ref is accessible in the current conversation;
- dispatch to plugin-registered save handlers by media type;
- be exposed to the model only when structural upload continuity exposes live upload refs.

Keep `system_create` responsible for content creation from normal sources:

- direct `content` saves, including assistant summaries/captions/descriptions as `base` notes;
- prompt generation;
- URL-first creates;
- source-derived artifacts via `sourceAttachment`;
- optionally explicit upload-to-note extraction, if that path remains intentionally separate from raw file preservation.

## Plugin handler model

Do not merge `document` and `image` entities. Instead, keep entity plugins separate and register upload-save handlers:

- `document` plugin: `application/pdf` uploads → durable `document` entity.
- `image` plugin: `image/*` uploads → durable `image` entity.

If no installed plugin can save the upload media type, the tool should return a clear unsupported-media result or be hidden when no handlers are available.

## Migration notes

- Move raw PDF/image upload promotion out of model-facing `system_create` guidance.
- Keep conversation upload-ref exposure structural, not message-text driven.
- Do not add deterministic NL guards such as “if user says save it, rewrite args”.

## Validation

Add or update tests/evals for:

1. Bare PDF upload → “save document” calls `system_upload_save` with the live upload ref.
2. Bare image upload → “save image” calls `system_upload_save` with the live upload ref.
3. Upload → summarize/describe → “save it” calls `system_create` with `entityType: "base"` and conversation content, not upload refs.
4. Missing document/image plugin returns or exposes a clean unsupported capability state.
5. Restarted conversations only expose upload save when persisted subscription/conversation state structurally marks the upload as live.
