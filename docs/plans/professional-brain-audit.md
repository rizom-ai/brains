# Professional Brain Audit - December 2025

## Phase 1: Security & ESLint Fixes ✓ COMPLETE

Previous audit addressed:

- ✓ Updated @modelcontextprotocol/sdk to ^1.24.0 (DNS rebinding vulnerability)
- ✓ Fixed 6 ESLint warnings in link/portfolio plugins
- ✓ Deleted unused CompactFooter component
- ✓ Documented matrix-bot-sdk form-data vulnerability (no fix available upstream)

---

## Phase 2: Expanded Code Quality Review

### HIGH PRIORITY - Code Duplication

#### 1. Job Handler Boilerplate (13+ handlers)

Every job handler repeats ~100 lines of identical code:

- Singleton pattern (getInstance/resetInstance/createFresh)
- `validateAndParse()` with Zod + logging
- `onError()` with standard logging
- Progress reporting pattern

**Files:** `plugins/*/src/handlers/*.ts`, `shell/*/src/handlers/*.ts`

**Fix:** Create `BaseJobHandler<TInput, TOutput>` abstract class

#### 2. DataSource Query Routing (11+ datasources)

All datasources repeat:

```typescript
if (params.query?.id) return this.fetchSingle(...);
if (params.query?.limit) return this.fetchList(...);
```

**Files:** `plugins/*/src/datasources/*.ts`

**Fix:** Create `BaseListDataSource<T>` with query routing

#### 3. Sorting Logic Duplication (8+ places)

Publication date sorting repeated with minor variations:

- Blog, Portfolio, Decks, Link, Professional-site datasources

**Fix:** Create `sortByPublicationDate()` utility in `@brains/utils`

---

### MEDIUM PRIORITY - Test Quality Issues

#### 4. Type Safety in Tests (50+ occurrences)

Pattern: `} as unknown as IEntityService;`

- Mocks don't implement full interfaces
- No compile-time verification
- Maintenance risk when interfaces change

**Fix:** Use `Partial<T>` pattern or create proper mock factories

#### 5. Missing Test Utilities Package

Logger mocking duplicated in 20+ test files:

```typescript
mockLogger = {
  debug: mock(() => {}),
  info: mock(() => {}),
  // ... repeated everywhere
} as unknown as Logger;
```

**Fix:** Create `@brains/test-utils` with shared mock builders

#### 6. Limited Integration Tests

Current: Heavy unit tests with mocked database
Gap: No in-memory DB integration tests for entity service

---

### MEDIUM PRIORITY - Missing Abstractions

#### 7. Adapter Markdown Utilities

5 adapters repeat try-catch boilerplate for markdown parsing:

- Blog, Portfolio, Note, Link, Summary adapters

**Fix:** Extract `extractBodyWithoutFrontmatter()`, `mergeMetadata()` helpers

#### 8. Pagination Schema Duplication

Identical `paginationInfoSchema` defined in Blog + Portfolio datasources

**Fix:** Move to `@brains/datasource` package

#### 9. Inconsistent Metadata Syncing

Different adapters sync different fields to metadata:

- Blog: title, slug, status, publishedAt, seriesName, seriesIndex
- Link: Only title, status (missing domain, capturedAt)
- Note: Only title

**Fix:** Document standard and ensure consistency

---

### LOW PRIORITY - Inconsistencies

#### 10. Adapter Instance Management

Mixed patterns:

- Singleton export: `export const blogPostAdapter = new BlogPostAdapter();`
- New instance per use: `const adapter = new LinkAdapter();`
- Injected dependency: stored in constructor

#### 11. Profile Parsing Inconsistency

Two different approaches:

- `ProfessionalProfileParser` (uses StructuredContentFormatter)
- `ProfileAdapter` (direct markdown parsing)

#### 12. Migration Script Duplication

3 migration files are 85% identical - could use factory function

---

## Recommended Refactoring Order

| Priority | Task                         | Impact                | Effort |
| -------- | ---------------------------- | --------------------- | ------ |
| 1        | Create `BaseJobHandler`      | Eliminate ~1000 lines | Medium |
| 2        | Create `@brains/test-utils`  | Fix 50+ type casts    | Medium |
| 3        | Extract sort utilities       | Eliminate ~40 lines   | Low    |
| 4        | Create `BaseListDataSource`  | Eliminate ~500 lines  | Medium |
| 5        | Move pagination schema       | Eliminate duplication | Low    |
| 6        | Standardize adapter patterns | Improve consistency   | Medium |

---

## Files Most Affected

**Job Handlers (13 files):**

- `plugins/blog/src/handlers/blogGenerationJobHandler.ts`
- `plugins/decks/src/handlers/deckGenerationJobHandler.ts`
- `plugins/portfolio/src/handlers/generation-handler.ts`
- `plugins/link/src/handlers/capture-handler.ts`
- `plugins/topics/src/handlers/topic-*-handler.ts`
- `plugins/directory-sync/src/handlers/*.ts`
- `plugins/site-builder/src/handlers/siteBuildJobHandler.ts`

**DataSources (11 files):**

- `plugins/*/src/datasources/*-datasource.ts`

**Test Files (20+ files):**

- All `test/*.test.ts` files with mock setup
