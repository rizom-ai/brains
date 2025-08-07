# Plan: Remove @brains/db Package and Reorganize Tests

## Context

After moving database ownership to EntityService and JobQueueService, we need to:

1. Remove the now-obsolete @brains/db package
2. Reorganize integration tests for better structure
3. Clean up remaining dependencies

## Current State

### Database Ownership (✅ COMPLETED)

- EntityService owns its database (brain.db)
- JobQueueService owns its database (brain-jobs.db)
- Shell no longer directly manages databases

### Package Structure

- `@brains/db` - OLD package, still exists but should be removed
- `@brains/entity-service` - Has its own database management
- `@brains/job-queue` - Has its own database management
- `@brains/integration-tests` - Separate package for integration tests (to be moved)
- `@brains/app` - High-level factory for creating Brain applications

### Remaining @brains/db Dependencies (VERIFIED)

#### Direct Code Imports
- `apps/test-brain/scripts/migrate.ts` - Uses @brains/db for migrations
- `shell/integration-tests/test/helpers/test-db.ts` - Uses @brains/db functions (enableWALMode, ensureCriticalIndexes)
- `shell/core/test/helpers/test-db.ts` - Imports runMigrations from @brains/db
- `shell/entity-service/test/entityService.test.ts` - Imports createId from @brains/db/schema
- `shell/entity-service/test/entityRegistry.test.ts` - Imports createId from @brains/db/schema

#### Package.json Dependencies
- `shell/core/package.json` - Has @brains/db dependency
- `apps/test-brain/package.json` - Has @brains/db dependency
- `plugins/directory-sync/package.json` - Has @brains/db dependency (unused)
- `shell/messaging-service/package.json` - Has @brains/db dependency (unused)
- `shell/content-generator/package.json` - Has @brains/db dependency (unused)

## Implementation Plan

### Phase 0: Fix createId Dependencies (NEW)

1. **Move createId utility to entity-service**:
   - Copy `createId` function from `shell/db/src/schema/utils.ts` to `shell/entity-service/src/utils.ts`
   - Update imports in entity-service tests:
     - `shell/entity-service/test/entityService.test.ts`
     - `shell/entity-service/test/entityRegistry.test.ts`

### Phase 1: Move Integration Tests to Core

1. **Move integration tests** from `shell/integration-tests/` to `shell/core/test/integration/`:
   - Move `app.integration.test.ts` → `shell/core/test/integration/app.integration.test.ts`
   - Move `mock-ai-service.ts` → `shell/core/test/helpers/mock-ai-service.ts`

2. **Update the integration test** to use temporary directories without @brains/db:

   ```typescript
   // Remove dependency on test-db.ts helper
   import { mkdtemp } from "fs/promises";
   import { tmpdir } from "os";
   import { join } from "path";

   const tempDir = await mkdtemp(join(tmpdir(), "brain-integration-test-"));

   // Let each service create its own database
   const shell = Shell.createFresh({
     database: {
       url: `file:${join(tempDir, "brain.db")}`,
     },
     jobQueueDatabase: {
       url: `file:${join(tempDir, "brain-jobs.db")}`,
     },
     // ...
   });
   ```

3. **Update core/test/helpers/test-db.ts**:
   - Remove dependency on @brains/db
   - Simply create temp directories for tests

4. **Delete the integration-tests package**:
   - Remove entire `shell/integration-tests/` directory
   - Update workspace configuration

### Phase 2: Update test-brain Migration Script

Update `apps/test-brain/scripts/migrate.ts`:

```typescript
// OLD
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const dbPackagePath = dirname(fileURLToPath(import.meta.resolve("@brains/db")));
process.env.DRIZZLE_MIGRATION_FOLDER = join(dbPackagePath, "..", "drizzle");
await import("@brains/db/migrate");

// NEW
import { migrateEntities } from "@brains/entity-service/migrate";

// Run entity migrations
await migrateEntities(
  {
    url: process.env.DATABASE_URL,
  },
  logger,
);
```

### Phase 3: Clean Up Package Dependencies

Remove `@brains/db` from package.json files:

- `shell/core/package.json`
- `apps/test-brain/package.json`
- `plugins/directory-sync/package.json`
- `shell/messaging-service/package.json`
- `shell/content-generator/package.json`

### Phase 4: Remove @brains/db Package

1. Delete the entire `shell/db/` directory
2. Remove from workspace configuration if needed

## Final Structure

```
shell/
  core/
    src/
      ...
    test/
      integration/
        app.integration.test.ts    # Moved from integration-tests
      helpers/
        test-db.ts                  # Existing
        mock-ai-service.ts          # Moved from integration-tests
        mock-shell.ts               # Existing
      ...
  entity-service/
    src/
      db/                          # Database management
      schema/                      # Entity schemas
      migrate.ts                   # Migration script
    ...
  job-queue/
    src/
      db/                          # Database management
      schema/                      # Job queue schemas
      migrate.ts                   # Migration script
    ...
```

## Benefits

1. **Simpler structure**: No separate integration-tests package
2. **Better organization**: All core tests in one place with clear separation
3. **Clean architecture**: Each service fully owns its database
4. **No legacy code**: Complete removal of obsolete @brains/db package
5. **Easier maintenance**: Related code is co-located

## Migration Steps

1. Create this plan document and commit ✓
2. Move integration tests to core/test
3. Update test-brain migration script
4. Remove @brains/db dependencies from package.json files
5. Delete @brains/db package
6. Run full test suite to verify
7. Update any documentation that references @brains/db

## Notes

- Integration tests will use temporary directories for database isolation
- Each service (EntityService, JobQueueService) manages its own database lifecycle
- No shared database utilities needed - everything is self-contained
