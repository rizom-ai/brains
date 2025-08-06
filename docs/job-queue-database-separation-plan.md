# Job Queue Database Separation Plan (Self-Contained Approach)

## Overview

This document outlines the plan to separate the job queue database from the main entity database by making the job-queue package self-contained with its own database management.

## Current State

- Single SQLite database (`brain.db`) contains both:
  - **Entity data**: Persistent knowledge (entities table with vectors)
  - **Job queue data**: Transient processing jobs (job_queue table)
- Job queue schema defined in `@brains/db` package
- JobQueueService receives database instance from Shell
- Tight coupling between Shell, DB, and JobQueue packages

## Goals

1. **Data Portability**: Entity data can be backed up/moved without job queue
2. **Performance**: Job queue operations don't impact entity queries
3. **Clean Architecture**: Job queue package owns its entire persistence layer
4. **Future Flexibility**: Enable easy migration to Redis or other job queue backends

## Analysis: Self-Contained Approach

### Pros ✅

1. **Better Encapsulation**: Job queue owns its entire stack
2. **Simpler Shell**: Shell doesn't need to know about job queue DB details
3. **Easier Testing**: Job queue tests can be fully self-contained
4. **Future Flexibility**: Can swap SQLite for Redis without touching Shell
5. **Clear Ownership**: All job queue concerns in one place
6. **Reduced Coupling**: Shell only needs to provide config, not DB instance

### Cons ❌

1. **Circular Dependency Risk**: Currently job-queue imports from @brains/db
2. **Database Lifecycle**: Need to manage connection lifecycle within package
3. **Configuration Passing**: Still need Shell to pass DB config

### Decision: Proceed with Self-Contained Approach

The benefits significantly outweigh the challenges. The circular dependency can be resolved by moving the job queue schema into the job-queue package.

## Implementation Plan

### Phase 1: Move Job Queue Schema

1. Move `shell/db/src/schema/job-queue.ts` to `shell/job-queue/src/schema/job-queue.ts`
2. Update all imports in job-queue package to use local schema
3. Remove job-queue related exports from @brains/db package
4. Update @brains/db to only export entity-related schemas

### Phase 2: Add Database Management to Job Queue Package

1. Add database dependencies to job-queue package:

   ```json
   {
     "dependencies": {
       "@libsql/client": "^0.15.7",
       "drizzle-orm": "^0.29.4",
       "nanoid": "^5.0.0"
     },
     "devDependencies": {
       "drizzle-kit": "^0.20.14"
     }
   }
   ```

2. Create database utilities:

   ```typescript
   // shell/job-queue/src/db/index.ts
   import { createClient } from "@libsql/client";
   import { drizzle } from "drizzle-orm/libsql";

   export interface JobQueueDbConfig {
     url?: string;
     authToken?: string;
   }

   export function createJobQueueDatabase(config: JobQueueDbConfig) {
     const url =
       config.url ??
       process.env.JOB_QUEUE_DATABASE_URL ??
       "file:./brain-jobs.db";
     const client = createClient({ url, authToken: config.authToken });
     const db = drizzle(client);
     return { db, client };
   }
   ```

3. Add Drizzle configuration:
   ```typescript
   // shell/job-queue/drizzle.config.ts
   export default {
     schema: "./src/schema/job-queue.ts",
     out: "./drizzle",
     dialect: "sqlite",
     driver: "libsql",
     dbCredentials: {
       url: process.env.JOB_QUEUE_DATABASE_URL || "file:./brain-jobs.db",
     },
   };
   ```

### Phase 3: Update JobQueueService

1. Modify constructor to accept configuration:

   ```typescript
   export interface JobQueueServiceConfig {
     databaseUrl?: string;
     authToken?: string;
   }

   export class JobQueueService implements IJobQueueService {
     private db: DrizzleDB;
     private client: Client;

     private constructor(config: JobQueueServiceConfig, logger: Logger) {
       const { db, client } = createJobQueueDatabase(config);
       this.db = db;
       this.client = client;
       this.logger = logger.child("JobQueueService");
     }
   }
   ```

2. Add lifecycle methods:

   ```typescript
   public async initialize(): Promise<void> {
     // Enable WAL mode
     await this.client.execute("PRAGMA journal_mode = WAL");

     // Run migrations
     await runMigrations(this.db);

     this.logger.info("Job queue database initialized");
   }

   public async shutdown(): Promise<void> {
     // Close database connection
     this.client.close();
   }
   ```

### Phase 4: Update Shell Integration

1. Simplify Shell config:

   ```typescript
   // shell/core/src/config/shellConfig.ts
   jobQueue: z.object({
     databaseUrl: z.string().optional(),
     authToken: z.string().optional(),
   })
     .optional()
     .default({});
   ```

2. Update Shell initialization:
   ```typescript
   // Pass config instead of database instance
   const jobQueueService = JobQueueService.getInstance(config.jobQueue, logger);
   await jobQueueService.initialize();
   ```

### Phase 5: Clean Up Dependencies

1. Remove job-queue related imports from @brains/db
2. Update all packages that import job-queue types to use @brains/job-queue
3. Ensure no circular dependencies remain

## File Changes Summary

### New Files

1. `shell/job-queue/src/schema/job-queue.ts` - Schema definition (moved)
2. `shell/job-queue/src/schema/utils.ts` - Utilities like createId (copied)
3. `shell/job-queue/src/db/index.ts` - Database creation and management
4. `shell/job-queue/drizzle.config.ts` - Drizzle configuration
5. `shell/job-queue/src/db/migrations.ts` - Migration runner
6. `shell/job-queue/drizzle/` - Migrations directory

### Modified Files

1. `shell/job-queue/package.json` - Add database dependencies
2. `shell/job-queue/src/job-queue-service.ts` - Self-contained DB management
3. `shell/job-queue/src/index.ts` - Export new types and schemas
4. `shell/core/src/config/shellConfig.ts` - Add job queue config
5. `shell/core/src/shell.ts` - Pass config instead of DB instance
6. `shell/db/src/schema/index.ts` - Remove job-queue export
7. Various test files to accommodate new structure

### Removed Files

1. `shell/db/src/schema/job-queue.ts` - Moved to job-queue package

## Environment Variables

- `JOB_QUEUE_DATABASE_URL` - Optional URL for job queue database (defaults to `file:./brain-jobs.db`)
- `DATABASE_URL` - Main database URL (unchanged)

## Benefits

1. **True Separation**: Job queue is completely independent
2. **Better Architecture**: Each package owns its persistence layer
3. **Easier Testing**: Mock at package boundary, not DB level
4. **Future-Proof**: Can replace SQLite with Redis without touching Shell
5. **Clear Boundaries**: No cross-package database dependencies
6. **Performance**: No lock contention between entity queries and job processing

## Risks and Mitigations

1. **Risk**: Package complexity increases
   - **Mitigation**: Clear documentation and consistent patterns

2. **Risk**: Database connection management
   - **Mitigation**: Proper lifecycle methods and error handling

3. **Risk**: Migration complexity
   - **Mitigation**: No data migration needed - fresh start for job queue

## Testing Strategy

1. Unit tests for database utilities
2. Integration tests for JobQueueService with real database
3. Mock JobQueueService for Shell tests
4. Verify no performance regression
5. Test database initialization and shutdown

## Success Criteria

- [ ] Job queue package manages its own database independently
- [ ] No circular dependencies between packages
- [ ] All existing tests pass
- [ ] New integration tests for database management
- [ ] Shell code simplified (no job queue DB concerns)
- [ ] Clean package boundaries with clear interfaces
- [ ] Performance maintained or improved
- [ ] Documentation updated

## Future Considerations

This architecture enables future enhancements:

1. **Redis Support**: Can add Redis adapter without changing Shell
2. **Horizontal Scaling**: Multiple workers can connect to same job DB
3. **Job Queue UI**: Can build monitoring UI that connects directly to job DB
4. **Different Storage**: Could use different storage for different job types

## Implementation Order

1. Create planning document (this document)
2. Move schema files to job-queue package
3. Add database dependencies and utilities
4. Update JobQueueService with lifecycle methods
5. Update Shell configuration and initialization
6. Update tests
7. Clean up old dependencies
8. Update documentation
