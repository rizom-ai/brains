# Content Management Package TODO

## Issues to fix after extraction:

1. **EntityService interface mismatch**:
   - Current code uses `queryEntities()` but EntityService interface has `listEntities()`
   - Need to update all usages to use `listEntities()` with filter options

2. **PluginContext missing queueJob method**:
   - Current code assumes `pluginContext.queueJob()` exists
   - Need to either add this method to PluginContext or use existing `enqueueContentGeneration()`

3. **Type imports**:
   - Need to properly import SiteContentPreview/SiteContentProduction types
   - Current imports are commented out to avoid circular dependencies

4. **Null safety issues**:
   - Multiple "possibly undefined" errors in generation operations
   - Need to add proper null checks

## Priority: High

These issues prevent the package from compiling and need to be resolved during integration.
