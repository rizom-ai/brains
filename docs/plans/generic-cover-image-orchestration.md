# Generic cover image orchestration

## Goal

Support requests like “create a post/deck/project/social post with a cover image” without making the agent guess a future entity ID and without adding entity-specific flags to core.

## Current problem

Cover image generation is currently a two-pass workflow:

1. create or generate the target entity
2. generate an image with `targetEntityType` and the actual `targetEntityId`

That is correct, but agent-driven one-turn requests can fail when the agent attempts step 2 immediately with a guessed slug/ID. A recent eval failure did this for a social post cover.

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
- direct creates can enqueue cover image generation after `entityService.createEntity*` returns the actual entity ID
- generated entities need a post-create hook or orchestration event so cover generation runs after the generation job creates the entity
- cover generation still uses the existing image generation path with `targetEntityType` and `targetEntityId`
- core must validate the target entity adapter supports cover images before enqueueing cover generation

## Open design question

Generated content is async. We need one of these approaches:

1. **Core post-generation orchestration**
   - include `coverImage` in generation job data
   - base generation handler or shared generation infrastructure enqueues image generation after entity creation
   - best if generation handlers share a common base path

2. **Plugin opt-in hook**
   - plugins that support generation read the generic `coverImage` option and call a shared helper after create
   - simpler migration, but more duplicated opt-in work

Prefer option 1 if the shared generation base can support it cleanly.

## Acceptance criteria

- Agent can request a cover image during entity creation without guessing IDs
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
