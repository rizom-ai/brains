# Shell Technical Debt

This document tracks known architectural improvements and optimizations for the shell package. These items are not critical for functionality but should be addressed before production use or as pain points arise.

## High Priority (before production)

### 1. Async Embedding Generation
- **Issue**: Embedding generation is synchronous and blocks entity operations
- **Impact**: Creates bottleneck when creating/updating many entities
- **Solution**: Implement background queue for embedding generation
- **When to fix**: When entity creation becomes noticeably slow

### 2. Component Disposal/Cleanup
- **Issue**: Only Shell has shutdown method; other components can't clean up resources
- **Impact**: Potential memory leaks in long-running processes
- **Solution**: Add `dispose()` method to all components following IDisposable pattern
- **When to fix**: Before deploying as long-running service

### 3. Service Interfaces
- **Issue**: Core services (EntityService, etc.) are concrete classes
- **Impact**: Harder to test and swap implementations
- **Solution**: Extract interfaces for all core services
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

### 10. Plugin Lifecycle Hooks
- **Issue**: Plugins only have initialization, no cleanup
- **Impact**: Plugins can't properly dispose resources
- **Solution**: Add dispose/reload hooks to plugin interface
- **When to fix**: When plugins need resource cleanup

### 11. Configuration Validation
- **Issue**: Config validation happens at runtime
- **Impact**: Invalid config discovered late
- **Solution**: Add startup validation phase
- **When to fix**: When config complexity increases

## Notes

- All improvements should be backward compatible
- Consider feature flags for breaking changes
- Profile before optimizing - validate assumptions with real usage
- Some "issues" might not be problems for the actual use case