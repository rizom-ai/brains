# Plan: Remove Preview/Production Distinction from Site Builder

## Summary
Remove the redundant preview/production content distinction from the site-builder plugin and simplify the architecture by using a single content type. Version control (git) will handle rollbacks and production deployment will be managed through standard deployment practices.

## Current State Analysis

The codebase currently has:
1. **Two entity types**: `site-content-preview` and `site-content-production`
2. **Promotion/rollback operations** to move content between environments
3. **Environment configuration** in routes and plugin config
4. **Commands** for `/site-promote` and `/site-rollback`
5. **Separate output directories** for preview and production builds
6. **Complex content resolution** that checks different entity types based on environment

## Refactoring Plan

### 1. Entity Consolidation
- Create single `site-content` entity type
- Remove `site-content-preview` and `site-content-production` schemas
- Update entity adapter to handle single type

### 2. Remove Promotion/Rollback Infrastructure
- Delete `promoteContent()` and `rollbackContent()` methods from `SiteContentService`
- Remove `promote()` and `rollback()` methods from `SiteContentOperations`
- Remove `/site-promote` and `/site-rollback` commands
- Delete `ContentDerivationJobHandler` (no longer needed)

### 3. Simplify Configuration
- Remove `environment` field from `SiteBuilderConfig`
- **KEEP** `previewOutputDir` and `productionOutputDir` for different build outputs
- Remove environment from route definitions
- Build target (preview/production) is now just about WHERE files are written, not WHAT content is used

### 4. Update Site Builder
- Simplify `getContentForSection()` to only check `site-content` entities
- Remove environment parameter from content resolution
- Build process still accepts target directory parameter (preview or production)
- The build target only affects output location, not content source

### 5. Clean Up Tests
- Update all tests to use `site-content` entity type
- Remove tests for promotion/rollback operations
- Simplify test fixtures

### 6. Data Migration
- Existing `site-content-production` entities should be renamed to `site-content`
- Existing `site-content-preview` entities can be deleted or migrated based on preference

## Benefits

1. **Simpler architecture**: One entity type instead of two
2. **Less code**: Remove promotion/rollback logic (~500+ lines)
3. **Clearer mental model**: Content is just content, deployment is separate
4. **Better alignment with git**: Use version control for history/rollback
5. **Reduced complexity**: No environment switching logic
6. **Easier testing**: Only one entity type to mock
7. **Flexible deployment**: Can still build to different directories for staging/production

## Implementation Steps

1. Create new `site-content` entity schema
2. Update entity adapter
3. Update `SiteContentOperations` to only handle generation
4. Remove promotion/rollback from `SiteContentService`
5. Update commands (remove promote/rollback)
6. Simplify `SiteBuilder` content resolution
7. Update configuration schema (keep output dirs, remove environment)
8. Fix all tests
9. Update documentation
10. Create migration script for existing data

## Files to Modify

### Core Changes
- `plugins/site-builder/src/types.ts` - New single entity schema
- `plugins/site-builder/src/entities/site-content-adapter.ts` - Single adapter
- `plugins/site-builder/src/lib/site-content-operations.ts` - Remove promote/rollback
- `plugins/site-builder/src/lib/site-content-service.ts` - Simplify to generation only
- `plugins/site-builder/src/lib/site-builder.ts` - Remove environment logic from content resolution
- `plugins/site-builder/src/commands/index.ts` - Remove promote/rollback commands, update build command
- `plugins/site-builder/src/config.ts` - Remove environment field, keep output directories
- `plugins/site-builder/src/plugin.ts` - Register single entity type

### Files to Delete
- `shell/content-service/src/handlers/contentDerivationJobHandler.ts`

### Tests to Update
- All tests in `plugins/site-builder/test/`
- Tests referencing derivation in `shell/content-service/test/`

## Build Command Changes

The `/site-build` command will change from:
```
/site-build [preview|production]
```

To:
```
/site-build [--production]
```

Where:
- Default builds to `previewOutputDir`
- `--production` flag builds to `productionOutputDir`
- Both use the same `site-content` entities
- The difference is only the output directory

## Rollback Strategy

If we need to revert changes:
1. Use git to revert commits
2. Restore from backup if data migration was performed
3. Re-deploy previous version

This approach aligns with modern deployment practices where:
- Development happens locally
- Git manages versions
- CI/CD handles deployment
- Production is just another deployment target (directory)

## Migration Script

```typescript
// Example migration script to consolidate entities
async function migrateEntities(entityService: EntityService) {
  // Get all production entities (these are the "live" ones)
  const productionEntities = await entityService.listEntities('site-content-production');
  
  // Create new site-content entities from production
  for (const entity of productionEntities) {
    await entityService.createEntity('site-content', {
      ...entity,
      entityType: 'site-content',
      id: entity.id, // Preserve the same ID
    });
  }
  
  // Optionally delete old entities after verification
  // await entityService.deleteByType('site-content-preview');
  // await entityService.deleteByType('site-content-production');
}
```

## Timeline

Estimated effort: 2-3 days
- Day 1: Entity consolidation and core refactoring
- Day 2: Command updates and test fixes
- Day 3: Documentation and migration script

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Data loss during migration | Create backup before migration, test migration script thoroughly |
| Breaking existing workflows | Document changes clearly, provide migration guide |
| Missing edge cases | Comprehensive test coverage, staged rollout |

## Success Criteria

- [ ] Single `site-content` entity type working
- [ ] All tests passing with new structure
- [ ] Commands simplified (no promote/rollback)
- [ ] Documentation updated
- [ ] Migration script tested and working
- [ ] Build process still outputs to separate directories
- [ ] No regression in functionality