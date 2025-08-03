# Shell Technical Debt

This document tracks known architectural improvements and optimizations for the shell package. These items are not critical for functionality but should be addressed before production use or as pain points arise.

**Last Updated**: 2025-08-03

## Recent Progress
- ✅ Plugin lifecycle hooks implemented (dispose methods)
- ✅ Plugin architecture refactored with clear interfaces 
- ✅ Component Interface Standardization pattern adopted
- ✅ Shared plugin packages consolidated into shell/plugins

## TODO Comments in Code

### Search Highlight Extraction

- **Location**: `src/entity/entityService.ts:579`
- **Issue**: Search results don't include text highlights showing where the query matched
- **Impact**: Users can't see why a particular result matched their search
- **Solution**: Implement highlight extraction that finds query terms in the content and returns surrounding text snippets

### Schema Validation for Extended Schemas

- **Location**: `src/entity/entityRegistry.ts`
- **Issue**: Need proper schema validation that works with schemas that extend the base entity schema
- **Impact**: Entity validation might not catch all issues with extended entity types
- **Solution**: Implement a validation approach that properly handles schema inheritance/extension

## High Priority (before production)

### 1. Async Embedding Generation

- **Issue**: Embedding generation is synchronous and blocks entity operations
- **Impact**: Creates bottleneck when creating/updating many entities
- **Solution**: Implement background queue for embedding generation
- **When to fix**: When entity creation becomes noticeably slow

### 2. Component Disposal/Cleanup ✅ PARTIALLY COMPLETE

- **Issue**: ~~Only Shell has shutdown method; other components can't clean up resources~~
- **Status**: Component Interface Standardization pattern implemented with `resetInstance()` for testing cleanup
- **Remaining**: Add full `dispose()` method to all components for production cleanup
- **Impact**: Potential memory leaks in long-running processes
- **When to fix**: Before deploying as long-running service

### 3. Service Interfaces ✅ PARTIALLY COMPLETE

- **Issue**: ~~Core services (EntityService, etc.) are concrete classes~~
- **Status**: Plugin architecture refactored with clear base interfaces (BasePlugin, CorePlugin, ServicePlugin, InterfacePlugin)
- **Remaining**: Extract interfaces for EntityService, QueryProcessor, and other core services
- **Impact**: Harder to test and swap implementations
- **When to fix**: When we need to mock services or provide alternative implementations

## Medium Priority (based on usage patterns)

### 4. Caching Layer

- **Issue**: No caching for embeddings or query results
- **Impact**: Repeated expensive operations
- **Solution**: Add configurable caching with TTL and invalidation
- **When to fix**: When seeing repeated identical queries

### 5. Batch Operations

- **Issue**: Entity operations are one-at-a-time
- **Impact**: Inefficient for bulk imports/updates
- **Solution**: Add batch methods for create/update/delete
- **When to fix**: When needing to process many entities

### 6. Error Standardization

- **Issue**: Mix of Error objects and strings, no error codes
- **Impact**: Inconsistent error handling, hard to handle specific cases
- **Solution**: Create custom error classes with codes and context
- **When to fix**: When building production error handling

### 7. Retry Logic

- **Issue**: No retry for external service failures (AI, embeddings)
- **Impact**: Transient failures cause permanent errors
- **Solution**: Add configurable retry with exponential backoff
- **When to fix**: When seeing transient failures in production

## Low Priority (nice to have)

### 8. Metrics/Telemetry

- **Issue**: No performance metrics or operation tracking
- **Impact**: Hard to debug performance issues
- **Solution**: Add optional metrics hooks
- **When to fix**: When needing production monitoring

### 9. Connection Pooling

- **Issue**: Single database connection
- **Impact**: Limited concurrent operations
- **Solution**: Implement connection pool
- **When to fix**: When seeing connection bottlenecks

### 10. Plugin Lifecycle Hooks ✅ COMPLETE

- **Issue**: ~~Plugins only have initialization, no cleanup~~
- **Status**: Implemented in plugin refactor - all plugins now have `dispose()` method
- **Completed**: BasePlugin includes lifecycle methods for initialization and cleanup
- **Impact**: Resolved - plugins can now properly manage resources

### 11. Configuration Validation

- **Issue**: Config validation happens at runtime
- **Impact**: Invalid config discovered late
- **Solution**: Add startup validation phase
- **When to fix**: When config complexity increases

## Recently Identified Issues

### 12. Path Resolution in Bundled Applications

- **Issue**: Relative paths don't resolve correctly when running from bundled Bun executables
- **Impact**: Webserver fails to find preview/production directories
- **Solution**: Use `resolve()` to convert all relative paths to absolute paths
- **Status**: Fixed in webserver, may need review in other packages
- **When to fix**: Already addressed, needs testing

### 13. Port Conflict Handling

- **Issue**: No graceful handling when default ports are already in use
- **Impact**: Server fails to start with unclear error messages
- **Solution**: Implement port scanning or better error messages
- **When to fix**: When deploying multiple instances

## Notes

- All improvements should be backward compatible
- Consider feature flags for breaking changes
- Profile before optimizing - validate assumptions with real usage
- Some "issues" might not be problems for the actual use case
- Regular cleanup of completed items to keep document focused
