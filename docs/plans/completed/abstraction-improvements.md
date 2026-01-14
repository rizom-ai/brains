# Codebase Abstraction Improvements Plan

## Overview

This plan addresses code duplication and missing abstractions across shell/core and plugins.

**Estimated Impact**: 440-605 lines saved across 20+ files

---

## Phase 1: Quick Wins (Exact Duplicates & Constants)

### 1.1 Progress Step Constants

**Problem**: Hardcoded progress percentages repeated in 5+ handlers

**Create**: `shared/utils/src/progress-steps.ts`

**Update**:

- `plugins/link/src/handlers/capture-handler.ts`
- `plugins/portfolio/src/handlers/generation-handler.ts`
- `plugins/topics/src/handlers/topic-extraction-handler.ts`
- `plugins/topics/src/handlers/topic-processing-handler.ts`
- `plugins/directory-sync/src/handlers/image-conversion-handler.ts`

```typescript
export const PROGRESS_STEPS = {
  START: 0,
  INIT: 10,
  FETCH: 20,
  PROCESS: 40,
  GENERATE: 50,
  EXTRACT: 60,
  SAVE: 80,
  COMPLETE: 100,
} as const;
```

### 1.2 JobResult Wrapper

**Problem**: Identical try/catch with `{ success: false, error: ... }` in all handlers

**Create**: `shared/utils/src/job-result.ts`

```typescript
export const JobResult = {
  success<T>(data: T): { success: true } & T {
    return { success: true, ...data };
  },

  failure(error: unknown): { success: false; error: string } {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  },
};
```

### 1.3 ZodErrorFormatter

**Problem**: Zod validation error formatting repeated

**Create**: `shared/utils/src/zod-error-formatter.ts`

```typescript
export function formatZodError(error: z.ZodError, prefix?: string): string {
  const issues = error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join(", ");
  return prefix ? `${prefix}: ${issues}` : issues;
}
```

---

## Phase 2: AIResponseParser Utility

**Problem**: Identical JSON.parse + schema validation in 3+ places

**Occurrences**:

- `plugins/link/src/handlers/capture-handler.ts`
- `plugins/link/src/lib/link-service.ts`
- `plugins/summary/src/lib/summary-extractor.ts`

**Create**: `shared/utils/src/ai-response-parser.ts`

```typescript
export function parseAIResponse<T>(
  result: unknown,
  schema: z.ZodSchema<T>,
  logger?: Logger,
): { success: true; data: T } | { success: false; error: string } {
  try {
    const data = typeof result === "string" ? JSON.parse(result) : result;
    return { success: true, data: schema.parse(data) };
  } catch (error) {
    logger?.error("AI response parsing failed", { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

---

## Phase 3: FrontmatterEntityAdapter Base Class

**Problem**: 6 adapters have nearly identical `fromMarkdown`/`toMarkdown`/`parseFrontMatter`

**Affected adapters**:

- `plugins/link/src/adapters/link-adapter.ts`
- `plugins/note/src/adapters/note-adapter.ts`
- `plugins/portfolio/src/adapters/project-adapter.ts`
- `plugins/summary/src/adapters/summary-adapter.ts`
- `plugins/blog/src/adapters/blog-post-adapter.ts`
- `plugins/social-media/src/adapters/social-post-adapter.ts`

**Create**: `shell/entity-service/src/adapters/frontmatter-entity-adapter.ts`

```typescript
export abstract class FrontmatterEntityAdapter<
  TEntity extends Entity,
  TMetadata,
  TFrontmatter,
> implements EntityAdapter<TEntity, TMetadata>
{
  abstract readonly entityType: string;
  abstract readonly schema: z.ZodSchema<TEntity>;
  abstract readonly frontmatterSchema: z.ZodSchema<TFrontmatter>;

  protected abstract mapFrontmatterToMetadata(
    frontmatter: TFrontmatter,
  ): TMetadata;

  public fromMarkdown(markdown: string): Partial<TEntity> {
    const { metadata: frontmatter } = parseMarkdownWithFrontmatter(
      markdown,
      this.frontmatterSchema,
    );
    return {
      content: markdown,
      entityType: this.entityType,
      metadata: this.mapFrontmatterToMetadata(frontmatter),
    } as Partial<TEntity>;
  }

  public toMarkdown(entity: TEntity): string {
    return entity.content;
  }

  public parseFrontMatter<T>(markdown: string, schema: z.ZodSchema<T>): T {
    const { metadata } = parseMarkdownWithFrontmatter(markdown, schema);
    return metadata;
  }

  public extractMetadata(entity: TEntity): TMetadata {
    return entity.metadata as TMetadata;
  }

  public generateFrontMatter(entity: TEntity): string {
    return entity.content;
  }
}
```

---

## Phase 4: EntityServiceWrapper (Optional)

**Problem**: Repeated entity service CRUD calls in services

**Create**: `shell/entity-service/src/entity-service-wrapper.ts`

```typescript
export class EntityServiceWrapper<TEntity extends Entity> {
  constructor(
    private entityService: IEntityService,
    private entityType: string,
  ) {}

  async list(options?: ListOptions): Promise<TEntity[]>;
  async get(id: string): Promise<TEntity | null>;
  async getOrCreate(
    id: string,
    creator: () => Promise<Partial<TEntity>>,
  ): Promise<TEntity>;
  async search(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult<TEntity>[]>;
}
```

---

## Implementation Order

1. **Phase 1** - Quick wins (progress constants, JobResult, ZodErrorFormatter)
2. **Phase 2** - AIResponseParser utility
3. **Phase 3** - FrontmatterEntityAdapter base class (biggest impact)
4. **Phase 4** - EntityServiceWrapper (optional, lower ROI)

---

## Verification

After each phase:

1. `bun run typecheck`
2. `bun test` for affected packages
3. `bun run lint`

---

## Success Criteria

1. Progress constants used in all job handlers
2. JobResult.failure() used in all handler catch blocks
3. AIResponseParser used in all AI response parsing locations
4. FrontmatterEntityAdapter base class used by 6 adapters
5. All tests pass
6. No new ESLint warnings

---

## Impact Summary

| Abstraction              | Lines Saved | Files Affected |
| ------------------------ | ----------- | -------------- |
| Progress constants       | 30-50       | 5 handlers     |
| JobResult wrapper        | 50-75       | 5+ handlers    |
| ZodErrorFormatter        | 15-20       | 2-3 files      |
| AIResponseParser         | 45-60       | 3 files        |
| FrontmatterEntityAdapter | 300-400     | 6 adapters     |
| **Total**                | **440-605** | **20+ files**  |
