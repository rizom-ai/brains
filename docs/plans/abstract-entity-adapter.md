# Streamline EntityAdapter with BaseEntityAdapter

## Context

Every entity plugin (note, blog, products, portfolio, link, newsletter, etc.) implements the `EntityAdapter` interface with 5 required methods. Three of these are **100% identical boilerplate** across all adapters:

- `extractMetadata()` — always `return entity.metadata`
- `parseFrontMatter()` — always wraps `parseMarkdownWithFrontmatter`
- `generateFrontMatter()` — always parses content then calls `generateFrontmatter`

The remaining two (`toMarkdown`, `fromMarkdown`) share a common "extract body, parse frontmatter, regenerate" pattern in 6+ adapters. This adds ~50-80 lines of copy-paste per plugin.

The goal is to introduce a `BaseEntityAdapter` abstract class that provides default implementations for the boilerplate methods and protected helpers for common sub-patterns, cutting adapter code roughly in half.

## Decisions

- **Name**: `BaseEntityAdapter` (the existing no-op `BaseEntityAdapter` gets inlined into `shellInitializer.ts`)
- **3 default methods**: `extractMetadata`, `parseFrontMatter`, `generateFrontMatter` — can be overridden
- **3 protected helpers**: `extractBody`, `parseFrontmatter`, `buildMarkdown` — for use in toMarkdown/fromMarkdown
- **3 generic type params**: `<TEntity, TMetadata, TFrontmatter>` where `TFrontmatter` defaults to `TMetadata`
- **Constructor**: config object with entityType, schema, frontmatterSchema, and optional CMS hints
- **toMarkdown/fromMarkdown stay abstract**: every adapter implements its own, using helpers
- **Migration**: one commit per adapter, simplest first
- **Excluded**: ImageAdapter (binary, no frontmatter), SummaryAdapter (custom log parsing)

## Phase 0: Inline existing BaseEntityAdapter

The current `BaseEntityAdapter` is a no-op passthrough used only in `shell/core/src/initialization/shellInitializer.ts` to register the `"base"` entity type. Inline it there and delete the old file, freeing up the name.

**Files changed:**

- `shell/core/src/initialization/shellInitializer.ts` — inline the no-op adapter
- `shell/entity-service/src/adapters/base-entity-adapter.ts` — **delete**
- `shell/entity-service/src/adapters/index.ts` — remove export
- `shell/entity-service/src/index.ts` — remove `BaseEntityAdapter` export

## Phase 1: Create `BaseEntityAdapter` abstract class

**File**: `shell/entity-service/src/adapters/base-entity-adapter.ts` (new, replaces deleted file)

```typescript
abstract class BaseEntityAdapter<
  TEntity extends BaseEntity<TMetadata>,
  TMetadata = Record<string, unknown>,
  TFrontmatter = TMetadata,
> implements EntityAdapter<TEntity, TMetadata>
```

**Default implementations** (can be overridden):

- `extractMetadata(entity)` — returns `entity.metadata`
- `parseFrontMatter(markdown, schema)` — delegates to `parseMarkdownWithFrontmatter`
- `generateFrontMatter(entity)` — calls `generateFrontmatter()` with entity.metadata

**Abstract methods** (subclasses must implement):

- `toMarkdown(entity)` — domain logic varies per adapter
- `fromMarkdown(markdown)` — domain logic varies per adapter

**Protected helpers** for use in `toMarkdown`/`fromMarkdown`:

- `extractBody(markdown)` — strips frontmatter, returns body (wraps the try/catch pattern)
- `parseFrontmatter(markdown)` — parses with this adapter's frontmatter schema
- `buildMarkdown(body, frontmatter)` — delegates to `generateMarkdownWithFrontmatter`

**Constructor** accepts a config object:

```typescript
constructor(config: {
  entityType: string;
  schema: z.ZodSchema<TEntity>;
  frontmatterSchema: z.ZodObject<z.ZodRawShape>;
  isSingleton?: boolean;
  hasBody?: boolean;
  supportsCoverImage?: boolean;
})
```

**Export from**: `shell/entity-service/src/index.ts` and re-export from `shell/plugins/src/index.ts`

**Tests**: `shell/entity-service/test/base-entity-adapter.test.ts`

- Test default `extractMetadata` returns `entity.metadata`
- Test default `parseFrontMatter` delegates correctly
- Test default `generateFrontMatter` round-trips
- Test protected helpers (`extractBody`, `parseFrontmatter`, `buildMarkdown`)
- Test with a concrete test subclass

## Phase 2: Migrate adapters (one commit per adapter, simplest first)

Each migration replaces `implements EntityAdapter` with `extends BaseEntityAdapter`, removes the 3 boilerplate methods, and uses protected helpers in `toMarkdown`/`fromMarkdown`.

### Migration order:

1. **NewsletterAdapter** (`plugins/newsletter/src/adapters/newsletter-adapter.ts`)
   - Simplest adapter. ~87 lines -> ~35 lines
   - No slug generation, metadata = frontmatter

2. **LinkAdapter** (`plugins/link/src/adapters/link-adapter.ts`)
   - Simple frontmatter. Has `createLinkContent` helper (keep as-is)

3. **ProductAdapter** (`plugins/products/src/adapters/product-adapter.ts`)
   - Adds slug generation in `fromMarkdown`

4. **OverviewAdapter** (`plugins/products/src/adapters/overview-adapter.ts`)
   - Similar to ProductAdapter

5. **BlogPostAdapter** (`plugins/blog/src/adapters/blog-post-adapter.ts`)
   - Slug + field merging in `toMarkdown`

6. **NoteAdapter** (`plugins/note/src/adapters/note-adapter.ts`)
   - Title extraction from H1. Has custom helpers (keep as-is)

7. **ProjectAdapter** (`plugins/portfolio/src/adapters/project-adapter.ts`)
   - Structured body sections. Has custom content parsing

8. **SeriesAdapter** (`plugins/blog/src/adapters/series-adapter.ts`)
   - Cover image preservation

9. **SocialPostAdapter** (`plugins/social-media/src/adapters/social-post-adapter.ts`)

10. **SiteContentAdapter** (`plugins/site-builder/src/entities/site-content-adapter.ts`)

### What stays as-is:

- **ImageAdapter** — binary content, no frontmatter. No savings.
- **SummaryAdapter** — complex log entry parsing, mostly custom logic.

### Example: NewsletterAdapter before/after

**Before** (87 lines):

```typescript
export class NewsletterAdapter
  implements EntityAdapter<Newsletter, NewsletterMetadata>
{
  public readonly entityType = "newsletter";
  public readonly schema = newsletterSchema;
  public readonly frontmatterSchema = newsletterFrontmatterSchema;

  public toMarkdown(entity: Newsletter): string {
    /* 12 lines */
  }
  public fromMarkdown(markdown: string): Partial<Newsletter> {
    /* 10 lines */
  }
  public extractMetadata(entity: Newsletter): NewsletterMetadata {
    return entity.metadata;
  }
  public parseFrontMatter<T>(md: string, schema: z.ZodSchema<T>): T {
    /* 3 lines */
  }
  public generateFrontMatter(entity: Newsletter): string {
    /* 1 line */
  }
}
```

**After** (~35 lines):

```typescript
export class NewsletterAdapter extends BaseEntityAdapter<
  Newsletter,
  NewsletterMetadata
> {
  constructor() {
    super({
      entityType: "newsletter",
      schema: newsletterSchema,
      frontmatterSchema: newsletterFrontmatterSchema,
    });
  }

  public toMarkdown(entity: Newsletter): string {
    const body = this.extractBody(entity.content);
    return this.buildMarkdown(body, entity.metadata as Record<string, unknown>);
  }

  public fromMarkdown(markdown: string): Partial<Newsletter> {
    const frontmatter = this.parseFrontmatter(markdown);
    return {
      entityType: "newsletter",
      content: markdown,
      metadata: frontmatter,
    };
  }
}
```

## Files Modified

| File                                                       | Change                                        |
| ---------------------------------------------------------- | --------------------------------------------- |
| `shell/core/src/initialization/shellInitializer.ts`        | Inline no-op adapter                          |
| `shell/entity-service/src/adapters/base-entity-adapter.ts` | **Replace** — abstract base class             |
| `shell/entity-service/test/base-entity-adapter.test.ts`    | **New** — unit tests                          |
| `shell/entity-service/src/index.ts`                        | Keep `BaseEntityAdapter` export               |
| `shell/plugins/src/index.ts`                               | Keep re-export                                |
| `plugins/*/src/adapters/*-adapter.ts`                      | Migrate to extend base class (one per commit) |

## Verification

After each change:

```bash
bun run typecheck
bun test <affected-plugin-or-package>
bun run lint
```

After all migrations:

```bash
bun run test  # full suite
```

Existing adapter tests should pass unchanged — they test behavior (toMarkdown output, fromMarkdown parsing), not implementation details.
