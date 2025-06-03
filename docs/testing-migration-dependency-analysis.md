# Testing Migration Dependency Analysis

## Current State

Integration tests currently depend on database migrations by:

1. Running `migrate()` from drizzle-orm during test database setup
2. Loading migration files from `packages/db/drizzle`
3. Creating the exact production schema for each test

## Options Analysis

### Option 1: Keep Migration Dependency (Current Approach)

**Pros:**

- Tests run against exact production schema
- Catches migration-related issues early
- Single source of truth for schema
- Tests validate that migrations work correctly

**Cons:**

- Tests are coupled to migration file locations
- Slower test setup (running migrations)
- Can't test without valid migration files
- Migration failures block all integration tests

### Option 2: Direct Schema Creation in Tests

**Pros:**

- Faster test setup (no migration parsing)
- No file system dependencies
- Tests are more isolated
- Can test schema variations easily

**Cons:**

- Risk of test schema diverging from production
- Need to maintain schema in two places
- Won't catch migration-specific issues
- Vector index creation might be complex

### Option 3: Hybrid Approach

Create a test utility that can either:

- Run migrations (for integration tests)
- Create schema directly (for unit tests)

**Implementation:**

```typescript
export async function createTestDatabase(options?: {
  useMigrations?: boolean;
}): Promise<TestDatabase> {
  if (options?.useMigrations) {
    // Current approach
    await migrate(db, { migrationsFolder });
  } else {
    // Direct creation
    await db.run(sql`CREATE TABLE entities (...)`);
    await db.run(sql`CREATE INDEX ...`);
  }
}
```

## Recommendation

**Keep the current migration-based approach for integration tests** because:

1. **Schema Consistency**: Integration tests should test against the real schema
2. **Migration Validation**: Tests serve as migration smoke tests
3. **Low Maintenance**: No duplicate schema definitions
4. **Current Pain Points Are Minor**: The file path issue is easily fixed

However, we should:

1. Make migration paths more robust (use package exports or environment variables)
2. Consider caching migration results for faster test runs
3. Add unit tests that mock the database entirely for pure logic testing

## Implementation Notes

If we decide to change this in the future:

1. Extract SQL schema creation into a shared utility
2. Ensure vector index creation works correctly
3. Add tests to verify test schema matches migration schema
4. Consider using Drizzle's push feature for test databases
