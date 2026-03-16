# Plan: Slide Directives, Layouts, Mermaid, and Visual Fixes for Decks

## Context

The current deck system renders every slide identically: left-aligned, single-column. There's no way to set per-slide backgrounds, create two-column layouts, or include diagrams. Bold and italic text both render as flat accent-colored blocks (losing typographic distinction). Title slides are visually boring with no cover image support. Reveal.js already defines a `<!-- .slide: ... -->` directive syntax — we just need to parse it ourselves since we don't use Reveal's markdown plugin.

**Cover image note:** `coverImageId` in frontmatter references an image entity. Resolving it to a URL requires the entity service, which `buildDetailResult()` doesn't receive. We'll override `fetch()` in `DeckDataSource` to resolve the image and inject a `<!-- .slide: data-background-image="..." -->` directive into the first slide's markdown. PresentationLayout stays generic.

## Approach

1. Parse Reveal.js-compatible slide directives from markdown
2. Add column layout system
3. Integrate Mermaid.js for diagrams
4. Fix inline typography (bold/italic/emphasis)
5. All via pure utility functions consumed by PresentationLayout

## Changes

### 1. `shared/utils/src/slide-directives.ts` (new)

Two pure functions:

- **`parseSlideDirectives(markdown)`** — extracts `<!-- .slide: key="value" ... -->` from a slide chunk. Returns `{ attributes: Record<string, string>, markdown: string }` (cleaned markdown with comment stripped). Handles quoted values, boolean attrs (`data-auto-animate`), multiple attrs per comment.

- **`splitColumns(markdown)`** — splits on `<!-- .break -->` comment. Returns `string[] | null` (null = no separator). Uses the same HTML comment syntax as slide directives — consistent, self-documenting, no collision with standard markdown.

Export from `shared/utils/src/index.ts`.

### 2. `shared/utils/src/presentation-html.ts` (new)

- **`convertMermaidBlocks(html)`** — replaces `<pre><code class="language-mermaid">...</code></pre>` with `<div class="mermaid">...</div>`, unescaping HTML entities inside.

Export from `shared/utils/src/index.ts`.

### 3. `shared/ui-library/src/PresentationLayout.tsx` (modify)

#### Pipeline change

```
split on --- → parseSlideDirectives(chunk) → splitColumns(clean) →
  columns? → markdownToHtml each column, wrap in .slide-columns div
  else     → markdownToHtml + convertMermaidBlocks
→ <section {...attrs} dangerouslySetInnerHTML>

Column separator uses `<!-- .break -->` — same HTML comment syntax as
`<!-- .slide: -->` directives, keeping one consistent system.
```

#### Visual fixes (CSS)

**Bold/italic** — currently both get `color: var(--color-accent)` making them indistinguishable colored blocks. Fix:

```css
/* Before (broken): */
.reveal strong,
.reveal em {
  color: var(--color-accent);
}

/* After: */
.reveal strong {
  font-weight: 700;
  color: var(--color-heading);
}
.reveal em {
  font-style: italic;
  color: var(--color-text-muted);
}
```

**First slide (title slide) styling** — detect when the first slide has only an `<h1>` (or `<h1>` + `<p>`) and give it a distinct look:

```css
.reveal .slides section:first-child {
  justify-content: center;
  align-items: center;
  text-align: center;
}
.reveal .slides section:first-child h1 {
  text-align: center;
}
.reveal .slides section:first-child p {
  text-align: center;
  color: var(--color-text-muted);
  font-size: clamp(1.25rem, 1.8vw, 2rem);
}
```

This auto-centers the first slide as a title card. Users can override with `<!-- .slide: class="no-title-layout" -->` if needed.

#### New layout CSS

```css
/* Column layouts */
.reveal .slide-columns {
  display: flex;
  gap: 2rem;
  width: 100%;
  height: 100%;
  align-items: flex-start;
}
.reveal .slide-columns .slide-column {
  flex: 1;
  min-width: 0;
}

/* Mermaid */
.reveal .mermaid {
  display: flex;
  justify-content: center;
  margin: 1.5rem 0;
}
.reveal .mermaid svg {
  max-width: 100%;
  max-height: 60vh;
}
```

#### Mermaid CDN

Add Mermaid.js script tag + init after Reveal.js init (guarded by `if (window.mermaid)`).

### 4. `plugins/decks/src/datasources/deck-datasource.ts` (modify)

Override `fetch()` to resolve cover image before building the detail result. When `coverImageId` is present in frontmatter:

1. Look up the image entity via `context.entityService.getEntity("image", coverImageId)`
2. Extract the image URL from the entity
3. Prepend `<!-- .slide: data-background-image="URL" data-background-opacity="0.4" -->` to the markdown body

This keeps PresentationLayout generic — it just sees a normal slide directive.

### 5. `plugins/decks/src/templates/generation-template.ts` (modify)

Add to `basePrompt` format requirements:

- `<!-- .slide: data-background-color="..." -->` for backgrounds
- `<!-- .slide: data-background-image="url" data-background-opacity="0.3" -->` for image backgrounds
- `<!-- .slide: class="layout-split" -->` + `<!-- .break -->` for two-column
- ` ```mermaid ` for diagrams
- Guidance on when to use each (sparingly: emphasis slides, comparisons, architecture)
- Note: first slide is auto-centered as title card

### 6. Tests

- `shared/utils/test/slide-directives.test.ts` — directive parsing, column splitting, edge cases
- `shared/utils/test/presentation-html.test.ts` — mermaid block conversion, passthrough of other code blocks

## Files

| File                                                 | Action                                     |
| ---------------------------------------------------- | ------------------------------------------ |
| `shared/utils/src/slide-directives.ts`               | Create                                     |
| `shared/utils/src/presentation-html.ts`              | Create                                     |
| `shared/utils/src/index.ts`                          | Add exports                                |
| `shared/utils/test/slide-directives.test.ts`         | Create                                     |
| `shared/utils/test/presentation-html.test.ts`        | Create                                     |
| `shared/ui-library/src/PresentationLayout.tsx`       | Modify pipeline + CSS fixes                |
| `plugins/decks/src/datasources/deck-datasource.ts`   | Override fetch() for cover image injection |
| `plugins/decks/src/templates/generation-template.ts` | Update basePrompt                          |

## Sequencing

1. `slide-directives.ts` + tests (tests first)
2. `presentation-html.ts` + tests (tests first, parallel with 1)
3. Export from `shared/utils/src/index.ts`
4. Update `PresentationLayout.tsx` (pipeline, CSS visual fixes, layouts, mermaid)
5. Update `DeckDataSource` — cover image directive injection
6. Update generation template

## Verification

1. `bun test shared/utils/` — new utility tests pass
2. `bun run typecheck` — no type errors
3. `bun run lint` — clean
4. Existing deck seed content still renders (no `<!-- .slide: -->` or `<!-- .break -->` = no behavior change)
5. Bold text renders as bold (not colored block), italic renders as italic
6. First slide auto-centers as title card
