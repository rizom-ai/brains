# EntityService Architecture Optimization Plan

## Overview

This document outlines a plan to optimize the EntityService architecture by making it completely self-contained with its own database, following the same pattern as JobQueueService. This optimization will remove unnecessary coupling between Shell and both the entities database and EmbeddingJobHandler.

## Current Architecture

### Problem: Shell Manages Entity Database

Currently, Shell manages the entities database and its initialization, creating unnecessary coupling:

```
Shell (shell.ts)
├── Creates entities database
├── Initializes WAL mode & vector indexes (for entities!)
├── Creates EntityService (passes db)
├── Creates EmbeddingJobHandler (passes db)  ← DETOUR
└── Registers EmbeddingJobHandler with JobQueueService  ← DETOUR
```

**Key Issue**: Shell is managing database initialization for entities, but only EntityService uses the entities database!

### Current Code Flow

1. **Shell creates entities database:**

```typescript
// In Shell constructor
const { db, client } = createDatabase({
  url: config.database.url,
  authToken: config.database.authToken,
});
this.db = db;
this.dbClient = client;
```

2. **Shell initializes database (for entities!):**

```typescript
// In ShellInitializer
await enableWALMode(this.dbClient, this.config.database.url, this.logger);
await ensureCriticalIndexes(this.dbClient, this.logger); // Vector indexes for entities!
```

3. **Shell creates EmbeddingJobHandler:**

```typescript
const embeddingJobHandler = EmbeddingJobHandler.createFresh(
  this.db, // Entities database
  this.embeddingService,
);
this.jobQueueService.registerHandler("embedding", embeddingJobHandler);
```

4. **EntityService receives the database:**

```typescript
EntityService.getInstance({
  db: this.db, // The database Shell created
  embeddingService: this.embeddingService,
  entityRegistry: this.entityRegistry,
  logger: this.logger,
  jobQueueService: this.jobQueueService,
});
```

## Problems with Current Approach

1. **Database Ownership Mismatch**: Shell owns entities database but only EntityService uses it
2. **Initialization Misplacement**: Shell initializes WAL mode and vector indexes for entities table
3. **Violation of Encapsulation**: Shell knows about EmbeddingJobHandler (entity implementation detail)
4. **Inconsistent Architecture**: JobQueueService is self-contained, but EntityService is not
5. **Unnecessary Coupling**: Shell is coupled to both database management AND entity handlers
6. **Split Responsibility**: Entity-related logic scattered between Shell, ShellInitializer, and EntityService
7. **Testing Complexity**: Tests need to mock database creation, initialization, and handler registration

## Proposed Optimization

### New Architecture: Self-Contained EntityService

Make EntityService completely self-contained like JobQueueService, owning its database and all entity operations:

```
Shell
├── JobQueueService (owns job_queue database)
└── EntityService (owns entities database)
    ├── Creates entities database internally
    ├── Initializes WAL mode & vector indexes
    ├── Creates EmbeddingJobHandler internally
    └── Registers handler with JobQueueService
```

**Key Insight**: EntityService becomes the **ONLY** consumer of the entities database, making it the natural owner.

### Implementation Changes

#### 1. Create EntityService Database Management

Add new `entity-service/src/db/` directory with database management:

```typescript
// entity-service/src/db/index.ts
export interface EntityDbConfig {
  url?: string;
  authToken?: string;
}

export function createEntityDatabase(config: EntityDbConfig = {}): {
  db: DrizzleDB;
  client: Client;
  url: string;
} {
  const url = config.url ?? process.env["DATABASE_URL"] ?? "file:./brain.db";
  const authToken = config.authToken ?? process.env["DATABASE_AUTH_TOKEN"];

  const client = authToken
    ? createClient({ url, authToken })
    : createClient({ url });

  const db = drizzle(client, { schema: entities });

  return { db, client, url };
}

export async function enableWALModeForEntities(
  client: Client,
  url: string,
): Promise<void> {
  if (url.startsWith("file:")) {
    await client.execute("PRAGMA journal_mode = WAL");
  }
}

export async function ensureEntityIndexes(client: Client): Promise<void> {
  await client.execute(`
    CREATE INDEX IF NOT EXISTS entities_embedding_idx 
    ON entities(libsql_vector_idx(embedding))
  `);
}
```

#### 2. Update EntityService Constructor

```typescript
// entityService.ts
export interface EntityServiceOptions {
  // Remove db - EntityService creates its own
  dbConfig?: EntityDbConfig;
  embeddingService: IEmbeddingService;
  entityRegistry?: EntityRegistry;
  logger?: Logger;
  jobQueueService: JobQueueService;
}

private constructor(options: EntityServiceOptions) {
  // Create own database
  const { db, client, url } = createEntityDatabase(options.dbConfig);
  this.db = db;
  this.dbClient = client;

  this.embeddingService = options.embeddingService;
  this.entityRegistry = options.entityRegistry ?? EntityRegistry.getInstance(Logger.getInstance());
  this.logger = (options.logger ?? Logger.getInstance()).child("EntityService");
  this.jobQueueService = options.jobQueueService;

  // Initialize database asynchronously
  this.initializeDatabase(client, url);

  // Create and register EmbeddingJobHandler
  this.embeddingJobHandler = EmbeddingJobHandler.createFresh(this.db, this.embeddingService);
  this.jobQueueService.registerHandler("embedding", this.embeddingJobHandler);
}

private async initializeDatabase(client: Client, url: string): Promise<void> {
  await enableWALModeForEntities(client, url);
  await ensureEntityIndexes(client);
}
```

#### 3. Update Shell - Remove Database Management

Remove all database management from Shell:

```typescript
// shell.ts - REMOVE ALL THIS:
import { createDatabase } from "@brains/db";

// Remove database properties
private readonly db: LibSQLDatabase<Record<string, never>>;
private readonly dbClient: Client;

// Remove database creation
const { db, client } = createDatabase({
  url: config.database.url,
  authToken: config.database.authToken,
});
this.db = db;
this.dbClient = client;

// Remove EmbeddingJobHandler creation
const embeddingJobHandler = EmbeddingJobHandler.createFresh(this.db, this.embeddingService);
this.jobQueueService.registerHandler("embedding", embeddingJobHandler);

// Remove from EntityService creation - pass config instead
EntityService.getInstance({
  db: this.db,  // REMOVE
  // REPLACE WITH:
  dbConfig: {
    url: config.database.url,
    authToken: config.database.authToken,
  },
  embeddingService: this.embeddingService,
  entityRegistry: this.entityRegistry,
  logger: this.logger,
  jobQueueService: this.jobQueueService,
});

// Remove database close
this.dbClient.close();
```

#### 4. Remove Database Initialization from ShellInitializer

Remove database initialization from ShellInitializer (EntityService does this now):

```typescript
// shellInitializer.ts - REMOVE:
import { enableWALMode, ensureCriticalIndexes } from "@brains/db";

// Remove initializeDatabaseSettings method entirely
// Remove dbClient parameter from constructor
```

## Benefits

1. **Perfect Encapsulation**: EntityService fully owns and manages its database and all entity operations
2. **Consistent Architecture**: Both JobQueueService and EntityService are now self-contained
3. **Reduced Coupling**: Shell no longer coupled to database management OR EmbeddingJobHandler
4. **Single Responsibility**: Shell focuses on orchestration, services own their domains
5. **Simplified Testing**: Database and handler logic can be tested entirely within EntityService
6. **Cleaner Shell**: Shell becomes much simpler, just creating and orchestrating services
7. **Better Error Handling**: EntityService can handle its own database initialization errors
8. **Parallel Structure**: JobQueueService and EntityService follow identical patterns
9. **Future Flexibility**: EntityService can add more handlers, indexes, or tables without Shell changes
10. **Ownership Clarity**: Clear ownership - EntityService owns entities, JobQueueService owns jobs

## Migration Steps

1. **Create EntityService Database Management**:
   - Add `entity-service/src/db/` directory
   - Create `createEntityDatabase`, `enableWALModeForEntities`, `ensureEntityIndexes` functions
   - Move entities schema imports to EntityService

2. **Update EntityService**:
   - Add database properties (`db`, `dbClient`)
   - Update constructor to create database internally
   - Add database initialization logic
   - Create and register EmbeddingJobHandler internally
   - Add proper cleanup methods

3. **Update Shell**:
   - Remove all database-related imports and properties
   - Remove database creation and initialization
   - Remove EmbeddingJobHandler creation and registration
   - Pass `dbConfig` to EntityService instead of `db`
   - Remove database cleanup from shutdown

4. **Update ShellInitializer**:
   - Remove database initialization methods
   - Remove database client parameter
   - Focus purely on shell-specific initialization

5. **Update Tests**:
   - EntityService tests handle database mocking internally
   - Shell tests no longer need to mock database or handlers
   - Update integration tests for new service boundaries

6. **Update Documentation**:
   - Update architecture diagrams
   - Update EntityService API documentation

## Considerations

### Database Migrations

- EntityService needs its own migration setup
- Consider copying migration patterns from JobQueueService
- Ensure database migrations run before EntityService starts

### Testing

- EntityService tests need to mock database creation
- Add test utilities for creating test databases
- Consider flag to disable database initialization for unit tests

### Initialization Order

- EntityService database initialization is async
- Consider startup coordination if other services depend on entities

### Cleanup

- EntityService must close database connection on shutdown
- Unregister EmbeddingJobHandler from JobQueueService
- Handle initialization failures gracefully

### Migration Compatibility

- Existing databases need to work with new architecture
- Consider data migration path if schema location changes

## Timeline

1. **Phase 1**: Create this planning document ✓
2. **Phase 2**: Create EntityService database management
3. **Phase 3**: Update EntityService constructor and properties
4. **Phase 4**: Update Shell to remove all database management
5. **Phase 5**: Update ShellInitializer
6. **Phase 6**: Update and run tests
7. **Phase 7**: Update documentation

## Success Criteria

- [ ] EntityService owns and manages entities database completely
- [ ] EntityService creates its own EmbeddingJobHandler
- [ ] Shell has no database-related code
- [ ] EntityService and JobQueueService follow identical self-contained patterns
- [ ] All tests pass
- [ ] No regression in functionality
- [ ] Significantly cleaner Shell architecture

## Final Architecture

After optimization, the architecture will be beautifully symmetric:

```
Shell (Orchestration Layer)
├── Configuration management
├── Service coordination
├── Template registration
└── Plugin management

Services (Domain Layer)
├── JobQueueService
│   ├── Owns job_queue database
│   ├── Manages job handlers
│   └── Handles job lifecycle
└── EntityService
    ├── Owns entities database
    ├── Manages EmbeddingJobHandler
    └── Handles entity lifecycle
```

**Key Achievement**: Each service is completely self-contained with clear domain ownership, while Shell focuses purely on orchestration.
