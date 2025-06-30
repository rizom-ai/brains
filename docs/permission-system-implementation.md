# Permission System Implementation Plan

## Overview

This document outlines the implementation plan for creating a unified security system in the Brain architecture. The system uses **Shell as Single Security Boundary** pattern where Shell.query() is the only entry point for all secured operations, ensuring consistent permission enforcement across the entire system.

## Current State Analysis

### What Exists

- `UserPermissionLevel` type: `"anchor" | "trusted" | "public"`
- `PermissionHandler` class in `shared/utils/src/permission-handler.ts`
- `MessageContext` interface with optional `userPermissionLevel` field
- Template permission system: `requiredPermission` field on templates
- Tool visibility system: `"public" | "anchor"` on `PluginTool`
- Shell-level permission checking for queries (partial implementation)

### Problem Statement

The main security issue is that **PluginContext.generateContent() bypasses Shell permission checking**, creating a security gap where:

- **Direct ContentGenerator access** allows plugins to bypass Shell.query() permission enforcement
- **Inconsistent enforcement** between Shell.query() (secured) and PluginContext.generateContent() (unsecured) paths
- **Tool visibility restrictions** exist but enforcement points are unclear
- **Template permissions** are checked in Shell but not in PluginContext path
- **Permission determination** is implemented but not consistently applied across all content generation

## New Architecture: Shell as Single Security Boundary

### Core Principle

**Shell.query() is the single chokepoint for ALL secured operations**

### Key Insight

Instead of creating complex abstractions, we route all content generation through the existing Shell.query() method which already has proper permission checking implemented.

### Simplified Architecture

```typescript
// Current security gap:
PluginContext.generateContent() → ContentGenerator (bypasses permissions)

// New secure flow:
PluginContext.generateContent() → Shell.query() → ContentGenerator (with permissions)
```

### Unified Permission Flow

```
User Request → Interface (determines userPermissionLevel) →
PluginContext.generateContent() → Shell.query() → Permission Check → ContentGenerator
```

## Implementation Plan

### Phase 1: Foundation and Analysis ✓

- [x] Create this implementation plan document
- [x] Analyze existing permission systems and identify gaps
- [x] Design Security Gateway architecture
- [x] Update implementation plan with unified approach

### Phase 2: Route PluginContext Through Shell

#### 2.1 Update PluginContext.generateContent Implementation

**File:** `shared/plugin-utils/src/interface-plugin.ts` (or wherever PluginContext is implemented)

**Problem:** Current implementation directly calls ContentGenerator:

```typescript
// Current (bypasses Shell permissions):
generateContent: <T = unknown>(
  templateName: string,
  context?: GenerationContext,
) => Promise<T> {
  return this.contentGenerator.generateContent(templateName, context);
}
```

**Solution:** Route through Shell.query() instead:

```typescript
// New (respects Shell permissions):
generateContent: <T = unknown>(
  templateName: string,
  context?: GenerationContext,
) => Promise<T> {
  // Get user permission level from current context
  const userPermissionLevel = this.determineUserPermissionLevel(context?.userId ?? 'default-user');

  // Route through Shell.query() which has proper permission checking
  return this.shell.query(
    context?.prompt ?? `Generate content using template: ${templateName}`,
    {
      userId: context?.userId,
      conversationId: context?.conversationId,
      metadata: { templateName, ...context?.data },
      userPermissionLevel,
    }
  ) as Promise<T>;
}
```

#### 2.2 Ensure Shell.query() Handles Template-specific Generation

**File:** `shell/core/src/shell.ts`

**Enhancement:** Update Shell.query() to handle template-specific requests:

```typescript
// In Shell.query() method, detect template-specific requests:
if (options?.metadata?.templateName) {
  const templateName = options.metadata.templateName as string;
  return this.contentGenerator.generateContent(templateName, {
    prompt: query,
    data: options.metadata,
  });
}
```

### Phase 3: Interface-Specific Permission Implementation

#### 3.1 Keep Existing Interface Base Classes

**File:** `shared/plugin-utils/src/base-plugin.ts`

**Status:** ✅ Already implemented with `determineUserPermissionLevel` method

**File:** `shared/plugin-utils/src/message-interface-plugin.ts`

**Status:** ✅ Already populates MessageContext.userPermissionLevel using base plugin method

**No changes needed** - existing implementation is correct for simplified approach

#### 3.2 CLI Interface Implementation

**File:** `interfaces/cli/src/cli-interface.ts`

**Status:** ⏳ To be implemented

**Implementation:**

```typescript
public determineUserPermissionLevel(_userId: string): UserPermissionLevel {
  return 'anchor'; // CLI access is always anchor level
}
```

#### 3.3 MCP Interface Implementation

**File:** Currently no dedicated MCP interface plugin - MCP tools are handled directly by McpServerManager

**Status:** ⏳ Need to clarify tool permission enforcement at MCP level

**Note:** Tools have visibility restrictions ("public" | "anchor") but enforcement point needs clarification

#### 3.4 Matrix Interface Implementation

**File:** `interfaces/matrix/src/matrix-interface.ts`

**Status:** ⏳ To be implemented

**Implementation:**

```typescript
public determineUserPermissionLevel(userId: string): UserPermissionLevel {
  // Use Shell's permission handler for dynamic user-based permissions
  return this.shell.getPermissionHandler().getUserPermissionLevel(userId);
}
```

### Phase 4: Clean Up Unused Permission Code

#### 4.1 Keep Core Permission Infrastructure

**Files to Keep:**

- ✅ Keep permission checking in `shell/core/src/shell.ts` query method (this is our security boundary)
- ✅ Keep MessageContext.userPermissionLevel field (used by existing interfaces)
- ✅ Keep PermissionHandler as-is (no need for SecurityGateway complexity)

**Files to Clean:**

- Remove any Security Gateway implementation attempts
- Remove unused AccessContext interfaces if any were created
- Clean up any complex permission abstractions that aren't needed

### Phase 5: Comprehensive Testing Strategy

#### 5.1 PluginContext Security Tests

**File:** `shared/plugin-utils/test/plugin-context-security.test.ts`

**Test Coverage:**

- PluginContext.generateContent() routes through Shell.query()
- Permission checking works for plugin-generated content
- Template permission enforcement in plugin context
- User permission level propagation
- Security boundary enforcement

#### 5.2 Integration Tests

**File:** `shell/integration-tests/test/security-integration.test.ts`

**Test Coverage:**

- End-to-end security flow through all chokepoints
- Template generation with different permission levels
- Tool execution with different visibility levels
- Resource access with different user levels
- Cross-interface consistency verification
- Permission bypass prevention

#### 5.3 Interface Security Tests

**CLI Tests** (`interfaces/cli/test/security.test.ts`):

- AccessContext creation with "anchor" level
- SecurityGateway integration

**Matrix Tests** (`interfaces/matrix/test/security.test.ts`):

- Dynamic permission level determination
- AccessContext creation based on user ID
- Security boundary enforcement

**MCP Tests** (`interfaces/mcp-server/test/security.test.ts`):

- AccessContext creation with "anchor" level
- Tool access verification through SecurityGateway

#### 5.4 Security Validation Tests

**Test Scenarios:**

- Unauthorized template access attempts via PluginContext.generateContent()
- Tool visibility enforcement at MCP level
- Permission level consistency across interfaces
- Shell.query() as single chokepoint verification
- PluginContext cannot bypass Shell permissions
- Interface permission determination accuracy

## Implementation Timeline

### Phase 1: Foundation ✓

- [x] Analyze existing permission systems and gaps
- [x] Design Security Gateway architecture
- [x] Create comprehensive implementation plan
- [x] Update todo tracking

### Phase 2: Route PluginContext Through Shell (Next)

- [ ] Update PluginContext.generateContent() to route through Shell.query()
- [ ] Enhance Shell.query() to handle template-specific generation requests
- [ ] Verify Shell permission checking works for plugin-generated content
- [ ] Test security boundary enforcement

### Phase 3: Interface Permission Implementation

- [x] BasePlugin has determineUserPermissionLevel method (already done)
- [x] MessageInterfacePlugin populates userPermissionLevel (already done)
- [ ] Implement interface-specific permission determination:
  - [ ] CLI interface (anchor level)
  - [ ] Clarify MCP tool permission enforcement
  - [ ] Matrix interface (dynamic levels)

### Phase 4: Cleanup Unused Code

- [ ] Remove any Security Gateway implementation attempts
- [ ] Remove unused AccessContext interfaces
- [ ] Keep existing permission infrastructure (PermissionHandler, MessageContext)
- [ ] Clean up complex abstractions that aren't needed

### Phase 5: Testing and Validation

- [ ] PluginContext security tests
- [ ] Shell.query() as single chokepoint verification
- [ ] Interface permission determination tests
- [ ] Security boundary enforcement validation
- [ ] Performance validation
- [ ] Documentation updates

## Success Criteria

### Functional Requirements

- ✅ Shell.query() is single chokepoint for ALL secured operations
- ✅ PluginContext.generateContent() routes through Shell with permissions
- ✅ Existing permission system (PermissionHandler, templates) works consistently
- ✅ Interfaces determine userPermissionLevel, Shell enforces permissions
- ✅ No bypass paths around Shell security controls
- ✅ Consistent behavior across all interfaces and execution paths

### Security Requirements

- ✅ No privilege escalation vulnerabilities
- ✅ Shell as single trusted security boundary
- ✅ Secure by default (public permissions)
- ✅ No bypass paths around Shell.query() permission checking
- ✅ Consistent permission enforcement across all content generation
- ✅ Simple, auditable security architecture

### Quality Requirements

- ✅ Comprehensive test coverage (>95%) including security tests
- ✅ Clear error messages for permission denials
- ✅ Minimal performance impact (<2ms per security check)
- ✅ Clean, maintainable security architecture
- ✅ Zero code duplication in permission logic
- ✅ Easy to extend for new resource types

## Risk Mitigation

### Security Risks

- **Risk:** Permission bypass vulnerabilities
- **Mitigation:** Comprehensive security testing and code review

### Performance Risks

- **Risk:** Permission checking adds latency
- **Mitigation:** Efficient caching and minimal overhead design

### Compatibility Risks

- **Risk:** Breaking existing interface functionality
- **Mitigation:** Thorough integration testing and gradual rollout

## Future Enhancements

### Short Term

- AccessContext caching for performance optimization
- Comprehensive audit logging for all SecurityGateway decisions
- Resource-level permission granularity
- SecurityGateway middleware for additional security layers

### Long Term

- Role-based access control (RBAC) system
- Dynamic permission delegation and inheritance
- External permission providers integration
- Multi-tenant security support
- Permission policy as code

## Conclusion

This Shell as Single Security Boundary implementation establishes a simple, robust security architecture that controls access to ALL protected resources through Shell.query() as the single chokepoint. The design eliminates the security gap where PluginContext.generateContent() bypassed permissions, while keeping the existing permission infrastructure (PermissionHandler, MessageContext, template permissions) that already works well. This approach provides consistent security enforcement across all content generation paths while maintaining architectural simplicity and avoiding over-engineering.
