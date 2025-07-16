# Type Consistency Guidelines

## Overview

This document establishes architectural guidelines for maintaining consistent type definitions across the monorepo. These guidelines address the identified anti-pattern of duplicating type definitions in multiple locations, which leads to maintenance debt and synchronization issues.

## Core Principle: Single Source of Truth

**All shared types MUST have a single source of truth.** This prevents interface drift and ensures type safety across the entire codebase.

## Type Definition Hierarchy

### 1. Core Package Types (Highest Priority)
Types defined in core packages should be the authoritative source:
- `@brains/job-queue` → `BatchOperation`, `JobStatusType`, `BatchJobStatus`
- `@brains/utils` → `UserPermissionLevel`, `ProgressNotification`
- `@brains/types` → `BaseEntity`, entity-related types
- `@brains/db` → `JobOptions`, `JobContext`, `JobQueue`

### 2. Shared Package Types (Medium Priority)
Types defined in shared packages for cross-plugin use:
- `@brains/plugin-utils` → `PluginContext`, `MessageContext`, interface definitions
- `@brains/messaging-service` → messaging-related types
- `@brains/view-registry` → view and route types

### 3. Plugin-Specific Types (Lowest Priority)
Types that are specific to individual plugins should remain in those plugins but follow consistent patterns.

## Audit Findings and Required Actions

### High-Severity Issues (Immediate Action Required)

#### 1. MessageContext Interface Duplication
**Status**: 🔴 Critical - Different implementations
- **Source of Truth**: `/shared/plugin-utils/src/interfaces.ts:272-280`
- **Duplicate**: `/shared/message-interface/src/base/types.ts:8-16`
- **Issue**: Different property requirements (`userPermissionLevel` optional vs required)
- **Action**: Consolidate to single definition with proper optionality

#### 2. JobStatusSummary Interface Duplication
**Status**: 🔴 Critical - Identical definitions in multiple locations
- **Locations**:
  - `/shared/content-management/src/types.ts:58-70`
  - `/plugins/site-builder/src/content-management/types.ts:101-113`
- **Action**: Move to appropriate shared package or establish clear ownership

#### 3. SiteContentJob Interface Duplication
**Status**: 🔴 Critical - Identical definitions
- **Locations**:
  - `/shared/content-management/src/types.ts:29-37`
  - `/plugins/site-builder/src/content-management/types.ts:57-65`
- **Action**: Establish clear ownership hierarchy

### Medium-Severity Issues

#### 1. Inline Type Definitions
**Pattern**: Factory methods and interfaces using inline types instead of importing from authoritative sources
- **Example**: `pluginContextFactory.ts` was using inline `BatchOperation` definition
- **Solution**: Always import types from their authoritative packages

## Implementation Guidelines

### 1. Type Import Strategy
```typescript
// ✅ CORRECT: Import from authoritative source
import type { BatchOperation } from "@brains/job-queue";

// ❌ INCORRECT: Inline type definition
type BatchOperation = {
  type: string;
  // ... inline definition
};
```

### 2. Type Consolidation Process
When consolidating duplicate types:

1. **Identify the most appropriate package** based on the type hierarchy
2. **Ensure the consolidated type meets all use cases** from all current locations
3. **Update all imports** to reference the single source
4. **Add deprecation comments** to old locations if gradual migration is needed
5. **Verify with TypeScript compilation** that all references are updated

### 3. Plugin-Specific Type Extensions
For plugin-specific extensions of shared types, use module augmentation:

```typescript
// ✅ CORRECT: Module augmentation pattern
declare module "@brains/db" {
  interface PluginJobDefinitions {
    "directory-export": {
      input: DirectoryExportJobData;
      output: ExportResult;
    };
  }
}
```

### 4. Interface Consistency Rules

#### Required Properties vs Optional Properties
- Be explicit about optionality
- Use TypeScript's `exactOptionalPropertyTypes: true` to catch mismatches
- Document the reasoning for optional vs required properties

#### Naming Conventions
- Use consistent naming across similar interfaces
- Prefer descriptive names over abbreviated ones
- Follow existing patterns in the codebase

## Enforcement Mechanisms

### 1. TypeScript Configuration
Ensure strict TypeScript settings are enabled:
```json
{
  "compilerOptions": {
    "exactOptionalPropertyTypes": true,
    "strict": true,
    "noImplicitAny": true
  }
}
```

### 2. ESLint Rules
Consider adding ESLint rules to detect:
- Inline type definitions that could use shared types
- Import patterns that bypass authoritative sources

### 3. Code Review Checklist
During code reviews, verify:
- [ ] New type definitions don't duplicate existing ones
- [ ] Imports reference authoritative sources
- [ ] Type extensions use proper module augmentation patterns
- [ ] Interface changes maintain backward compatibility

## Immediate Action Items

### Phase 1: Critical Fixes
1. **Consolidate MessageContext interface** - Choose single definition and update all references
2. **Consolidate JobStatusSummary interface** - Move to shared package or establish ownership
3. **Consolidate SiteContentJob interface** - Establish clear ownership hierarchy

### Phase 2: Pattern Establishment
1. **Update documentation** to reference these guidelines
2. **Add TypeScript/ESLint rules** for enforcement
3. **Create migration guide** for existing inline types

### Phase 3: Prevention
1. **Code review templates** that include type consistency checks
2. **CI/CD checks** for type duplication detection
3. **Regular audits** of type definitions across packages

## Success Metrics

- **Zero duplicate type definitions** for shared interfaces
- **Consistent TypeScript compilation** across all packages
- **Reduced maintenance overhead** for type updates
- **Improved developer experience** with clear type hierarchies

## Related Documentation

- [Architecture Overview](./architecture-overview.md)
- [Plugin System](./plugin-system.md)
- [Development Workflow](./development-workflow.md)