# Plan: Prompts as Entities

## Context

Every entity plugin has AI prompts hardcoded in TypeScript template files. These prompts define the brain's personality — how it writes blog posts, extracts topics, generates newsletters. They're the most user-facing part of the brain, but they're buried in code.

## Problem

- Users can't customize prompts without editing TypeScript and rebuilding
- Prompts are scattered across ~15 template files in different entity plugins
- Brain identity (voice, style) leaks into code instead of living with the brain's data
- Different brains can't have different prompts — they're in the brain model, not per-instance

## Design

Prompts become a **prompt entity type** — markdown files in brain-data, managed by the existing entity infrastructure. No new file-loading mechanism, no parallel system. Just entities.

### Prompt entity

```markdown
---
title: Blog Generation
target: blog:generation
---

You are writing blog posts in a distinctive voice that blends
philosophy, technology, and culture.

Write in a reflective, analytical tone. Use concrete examples.
Connect abstract ideas to practical implications.
```

- `target` maps to a template name (e.g. `blog:generation`, `link:extraction`, `series:description`)
- Body is the prompt text
- Stored in `brain-data/prompt/` (same as any entity type)
- Editable via CMS, system_update, or text editor
- Git-tracked alongside content

### How templates load prompts

Templates check for a prompt entity matching their name. If found, use it. If not, fall back to the hardcoded default.

```typescript
// In template registration
const promptEntity = await context.entityService.getEntity(
  "prompt",
  "blog:generation",
);
const basePrompt = promptEntity?.content ?? DEFAULT_BLOG_PROMPT;
```

The fallback is the current hardcoded text — existing brains work without any prompt entities.

### Prompt EntityPlugin

```typescript
class PromptPlugin extends EntityPlugin<Prompt> {
  readonly entityType = "prompt";
  readonly schema = promptSchema;
  readonly adapter = promptAdapter;
}
```

Minimal EntityPlugin. No derive(), no generation handler, no tools. Just schema + adapter for markdown serialization. CMS handles editing. Directory-sync handles persistence.

### Seed content

Brain models ship default prompts in seed content:

```
brains/rover/seed-content/
  prompt/
    blog-generation.md
    blog-excerpt.md
    deck-generation.md
    newsletter-generation.md
    note-generation.md
    portfolio-generation.md
    social-media-linkedin.md
    link-extraction.md
    topic-extraction.md
    series-description.md
    summary-response.md
    image-generation.md
```

Directory-sync copies on first setup. Users edit from there. Seed content updates don't overwrite user edits.

### What this enables

- **User customization**: edit prompts in CMS, text editor, or via git
- **Per-instance personality**: yeehaa.io has philosophical tone, mylittlephoney has playful tone — same brain model, different prompts
- **Prompt versioning**: prompts in git — history, diffs, rollback
- **Desktop app**: edit prompts in the CMS view
- **Agent can update prompts**: `system_update { entityType: "prompt", id: "blog-generation" }` changes the brain's writing style through conversation

## Prompt inventory

| Target                  | Prompt file                | Current location                                           |
| ----------------------- | -------------------------- | ---------------------------------------------------------- |
| `blog:generation`       | `blog-generation.md`       | `entities/blog/src/templates/generation-template.ts`       |
| `blog:excerpt`          | `blog-excerpt.md`          | `entities/blog/src/templates/excerpt-template.ts`          |
| `decks:generation`      | `deck-generation.md`       | `entities/decks/src/templates/generation-template.ts`      |
| `decks:description`     | `deck-description.md`      | `entities/decks/src/templates/description-template.ts`     |
| `newsletter:generation` | `newsletter-generation.md` | `entities/newsletter/src/templates/generation-template.ts` |
| `note:generation`       | `note-generation.md`       | `entities/note/src/templates/generation-template.ts`       |
| `portfolio:generation`  | `portfolio-generation.md`  | `entities/portfolio/src/templates/generation-template.ts`  |
| `social-media:linkedin` | `social-media-linkedin.md` | `entities/social-media/src/templates/linkedin-template.ts` |
| `link:extraction`       | `link-extraction.md`       | `entities/link/src/templates/extraction-template.ts`       |
| `topics:extraction`     | `topic-extraction.md`      | `entities/topics/src/templates/extraction-template.ts`     |
| `series:description`    | `series-description.md`    | `entities/series/src/templates/description-template.ts`    |
| `summary:response`      | `summary-response.md`      | `entities/summary/src/templates/summary-ai-response.ts`    |
| `image:generation`      | `image-generation.md`      | `entities/image/src/lib/build-image-base-prompt.ts`        |

## Steps

### Phase 1: Prompt EntityPlugin

1. Create `entities/prompt/` — schema, adapter, plugin
2. Register in brain models
3. Tests

### Phase 2: Template prompt resolution

1. Add `resolvePrompt(target, fallback)` helper to template system
2. Looks up prompt entity by target, falls back to hardcoded default
3. Update template registration to use resolved prompts
4. Tests — works with and without prompt entities

### Phase 3: Migrate prompts to seed content

1. Extract current hardcoded prompts into seed content markdown files
2. One per template, matching the target naming convention
3. Verify new brain instances get seed prompts

### Phase 4: Migrate templates

1. Update each template to use `resolvePrompt()` instead of hardcoded basePrompt
2. One entity at a time, starting with blog
3. Keep hardcoded text as fallback in each template
4. Tests — generation identical with and without prompt entities

## Verification

1. `bun test` — all tests pass
2. Generation works identically with no prompt entities (fallback)
3. Custom prompt entity overrides default behavior
4. New brain instance gets seed prompts via directory-sync
5. Editing prompt entity changes generation behavior
6. CMS shows prompt entities as editable
7. `system_update` can modify prompts through conversation
8. Git tracks prompt changes alongside content
