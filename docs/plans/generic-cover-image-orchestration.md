# Generic cover image orchestration

## Status

Implemented in the `plan/cover-image-orchestration` worktree. `system_create` accepts generic `coverImage` orchestration and queues image generation after entity creation.

## Goal

Support requests like “create a post/deck/project/social post with a cover image” without making the agent guess a future entity ID and without adding entity-specific flags to core.

## Current problem

Cover image generation is currently a two-pass workflow:

1. create or generate the target entity
2. generate an image with `targetEntityType` and the actual `targetEntityId`

That is correct and should remain the internal execution model. The problem is the public/tool orchestration: agent-driven one-turn requests can fail when the agent attempts step 2 immediately with a guessed slug/ID. A recent eval failure did this for a social post cover.

For generated text entities, image generation also depends on the finished text. The image job needs the real created entity ID and, when available, the generated title/content so it can derive a relevant image prompt. Therefore image generation must run after text/entity creation, not in parallel.

A quick `generateImage` flag would avoid the guessed ID, but it is too vague and social-media-shaped for generic `system_create`.

## Proposed API

Add a generic cover-image option to `system_create`:

```ts
coverImage?:
  | boolean
  | {
      generate?: boolean;
      prompt?: string;
    };
```

Preferred normalized form:

```ts
coverImage?: {
  generate: true;
  prompt?: string;
};
```

Example:

```ts
system_create({
  entityType: "social-post",
  prompt: "Write a LinkedIn post about continuous learning in tech",
  coverImage: {
    generate: true,
    prompt: "Editorial technology graphic about continuous learning",
  },
});
```

## Architecture

Core may own this because cover images are a generic entity capability (`supportsCoverImage`), not a social-media-specific feature.

Implementation should preserve plugin boundaries:

- `system_create` accepts the generic `coverImage` option
- the one-call API is orchestration sugar over the existing sequential two-pass model; it must not imply parallel text/image generation
- direct creates can enqueue cover image generation after `entityService.createEntity*` returns the actual entity ID
- generated entities need a post-create hook or orchestration event so cover generation runs after the generation job creates the entity
- for generated entities, enqueue the image job with the generated title/content (`entityTitle` / `entityContent`) so the existing image handler can distill a prompt from the finished text
- cover generation still uses the existing image generation path with `targetEntityType` and `targetEntityId`
- core must validate the target entity adapter supports cover images before enqueueing cover generation

## Implemented design

Generated content is async and the image prompt may depend on the generated text, so the implementation uses core/shared post-generation orchestration:

- `system_create` normalizes `coverImage` and validates `supportsCoverImage` before direct or generated creation.
- Direct creates enqueue `image:image-generate` only after `entityService.createEntity*` returns the actual entity ID.
- Generation jobs receive the normalized `coverImage` request.
- `BaseGenerationJobHandler` preserves the generic `coverImage` request through validation and enqueues `image:image-generate` after the generated entity is persisted.
- Generated title/content are passed to the image job as `entityTitle` and `entityContent` so prompt distillation can use finished text.

## Acceptance criteria

- Agent can request a cover image during entity creation without guessing IDs
- Image generation runs after target entity creation and receives the real target entity ID
- For generated text entities, image generation can use the finished generated title/content as prompt context
- Works for any entity type whose adapter supports cover images
- Does not introduce social-media-specific fields in core
- Existing two-pass explicit flow still works
- `system_create` with `coverImage` on an entity type that does not support covers returns a clear error or ignores with a clear warning (choose one)
- Rover eval `social-media-generate-post-with-image` passes without requiring a guessed ID

## Migration notes

- Do not use `generateImage` as the public field name
- Update agent instructions to prefer `coverImage` once implemented
- Add tests at core level for direct create + cover image option
- Add at least one generated entity eval/test, likely social-post because it exposed the issue
