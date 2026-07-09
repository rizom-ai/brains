# Plan: CMS AI-Assisted Authoring

## Status

Not started — successor to the shipped `first-party-cms-editor.md` plan (its optional
Phase 6, split out when that plan retired). To be scoped properly once the first-party
editor has been merged and authored against.

## Context

The first-party CMS editor (shipped) writes through the entity service and renders a
React 19 app at `/cms` built on the same stack as `web-chat`. That stack already vendors
`@ai-sdk/react`, which was one of the original reasons to build the editor first-party:
the door is open to AI-assisted authoring inside the editing surface itself.

Also relevant: the D1 body-editor upgrade (CodeMirror 6) from the original plan remains
pending authoring feedback against the floor-tier textarea. If both this plan and D1 get
picked up, sequence them deliberately — an AI-assisted flow may change what the body
editor needs to be.

## Goal (to be refined)

Inline AI assistance against the entity being edited: draft, rewrite, summarise,
tag-suggest — reusing the `@ai-sdk/react` stack and the brain's existing AI service,
with every accepted suggestion still flowing through the normal entity-service write
path (single-writer model unchanged).

## Non-goals

- No separate AI editing surface; assistance lives inside the existing `/cms` editor.
- No bypass of the entity service or the save pipeline.

## Next step

Author real content in the editor first; let that experience drive which assists
matter, then scope phases here (thin vertical slices, tests first).
