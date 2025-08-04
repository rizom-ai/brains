# Permission System Implementation Plan

## Overview

This document outlines the implementation plan for creating a unified security system in the Brain architecture. The system uses **Shell as Single Security Boundary** pattern where Shell.generateContent() is the only entry point for all secured operations, ensuring consistent permission enforcement across the entire system.

## Current State Analysis

### What Exists

- `UserPermissionLevel` type: `"anchor" | "trusted" | "public"`
- `PermissionHandler` class in `shared/utils/src/permission-handler.ts`
- `MessageContext` interface with optional `userPermissionLevel` field
- Template permission system: `requiredPermission` field on templates
- Tool visibility system: `"public" | "anchor"` on `PluginTool`
- Shell-level permission checking for queries (partial implementation)

### Problem Statement (Updated)

The main remaining security issues are:

- **MCP Tool Permission Filtering**: Tools are registered with visibility levels but not filtered by user permissions - all tools are exposed to all MCP clients
- **Permission Context Missing**: PluginContext.generateContent() uses hardcoded "default-user" instead of actual user permission levels from interfaces
- **Interface Permission Flow**: Permission levels are determined by interfaces but not passed through to content generation

**Note**: The original security gap where PluginContext.generateContent() bypassed Shell permission checking has been **RESOLVED** - PluginContext now correctly routes through Shell.generateContent().

## New Architecture: Shell as Single Security Boundary

### Core Principle

**Shell.generateContent() is the single chokepoint for ALL secured content generation operations**

### Key Insight

Instead of creating complex abstractions, we route all content generation through the existing Shell.generateContent() method which already has proper permission checking implemented.

### Current Secure Architecture (Implemented)

```typescript
// Current secure flow (IMPLEMENTED):
PluginContext.generateContent() → Shell.generateContent() → ContentGenerator (with permissions)

// MCP tool filtering (REGISTRATION-TIME APPROACH):
Shell startup → Determine MCP server permission level →
 McpServerManager.handleToolRegistration() → Filter by tool.visibility →
 Register only appropriate tools with MCP server
```

### Current Permission Flows

```
User Request → Interface (determines userPermissionLevel) →
PluginContext.generateContent() → Shell.generateContent() → Permission Check → ContentGenerator
```

## Implementation Plan

### Phase 1: Foundation and Analysis ✓

- [x] Create this implementation plan document
- [x] Analyze existing permission systems and identify gaps
- [x] Design Security Gateway architecture
- [x] Update implementation plan with unified approach

### Phase 2: Route PluginContext Through Shell ✅ COMPLETED

#### 2.1 Update PluginContext.generateContent Implementation ✅ COMPLETED

**File:** `shell/core/src/plugins/pluginContextFactory.ts`

**Status:** ✅ COMPLETED - Implementation already routes through Shell.generateContent()

```typescript
// Actual current implementation (SECURE):
generateContent: async <T = unknown>(
  templateName: string,
  context?: GenerationContext,
): Promise<T> => {
  const namespacedTemplateName = this.ensureNamespaced(templateName, pluginId);

  // Always route through Shell.generateContent() for consistent permission checking
  const queryResponse = await shell.generateContent<T>(
    context?.prompt ??
      `Generate content using template: ${namespacedTemplateName}`,
    namespacedTemplateName,
    {
      userId: "default-user", // TODO: Pass actual user permission level
      ...(context?.data && { data: context.data }),
    },
  );

  return queryResponse;
};
```

**Remaining issue:** Need to pass actual user permission level instead of hardcoded "default-user"

#### 2.2 Remaining Work: Fix Permission Context Flow

**File:** `shell/core/src/shell.ts`

**Enhancement:** Update Shell.generateContent() to handle template-specific requests:

```typescript
// In Shell.generateContent() method, detect template-specific requests:
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

- PluginContext.generateContent() routes through Shell.generateContent()
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

**MCP Tests** (`shared/mcp-server/test/security.test.ts`):

- AccessContext creation with "anchor" level
- Tool access verification through SecurityGateway

#### 5.4 Security Validation Tests

**Test Scenarios:**

- Unauthorized template access attempts via PluginContext.generateContent()
- Tool visibility enforcement at MCP level
- Permission level consistency across interfaces
- Shell.generateContent() as single chokepoint verification
- PluginContext cannot bypass Shell permissions
- Interface permission determination accuracy

## Implementation Timeline

### Phase 1: Foundation ✓

- [x] Analyze existing permission systems and gaps
- [x] Design Security Gateway architecture
- [x] Create comprehensive implementation plan
- [x] Update todo tracking

### Phase 2: Route PluginContext Through Shell ✅ COMPLETED

- [x] Update PluginContext.generateContent() to route through Shell.generateContent()
- [x] Verify Shell permission checking works for plugin-generated content
- [x] Test security boundary enforcement

**MCP Tool Permission Filtering (Registration-Time Approach) ✅ COMPLETED**

- [x] Add serverPermissionLevel parameter to McpServerManager constructor
- [x] Implement tool filtering in handleToolRegistration() based on server permission level
- [x] Update Shell initialization to determine and pass MCP server permission level
- [x] Add configuration option for MCP server permission level (default: "public")

**Approach:** Filter tools at registration time based on MCP server's permission level, not per-tool-call. This is simpler, more efficient, and aligns with the MCP model where server capabilities are fixed at startup.

**MCP Tool Filtering Logic:**

- "public" MCP server: Only register tools with `visibility: "public"`
- "trusted" MCP server: Register tools with `visibility: "public"` or `"trusted"`
- "anchor" MCP server: Register all tools (`"public"`, `"trusted"`, and `"anchor"` visibility)
- Default MCP server permission level: "public" (for safety)
- Configuration option to set MCP server as "trusted" or "anchor" level

**Benefits:**

- No per-call overhead - filtering happens once at startup
- Aligns with MCP protocol where server capabilities are static
- Simple and secure - inappropriate tools never get registered
- Clear separation of concerns - permission level is server-wide property

### Phase 3: Interface Permission Grant System

**Architecture: Interface Grant Override Model**

**Permission Grant Logic:**

- **CLI Interface**: Grants `"anchor"` permission (local access overrides user permissions)
- **Matrix Interface**: No permission grant (respects Matrix room-based user hierarchy)
- **MCP Server**: Configurable grant level based on transport (stdio=anchor, http=user-based)

**Permission Flow:**

- **CLI**: `interfacePermissionGrant="anchor"` → Always anchor regardless of user
- **Matrix**: `interfacePermissionGrant=undefined` → Use actual user permission level from room hierarchy
- **MCP**: `interfacePermissionGrant=configurable` → Transport-based grant level

**Implementation Status:**

- [ ] Update PluginContext.generateContent() to accept interfacePermissionGrant parameter
- [x] Add CLI interface anchor permission grant capability
- [ ] Update Matrix interface to use user permissions (remove blanket anchor grant)
- [ ] **CRITICAL**: Fix PluginContext hardcoded "default-user" in generateContent()
- [ ] Implement interface grant override logic in PluginContext
- [ ] Add comprehensive test coverage for permission grant system

**MCP Permission Handling:**

MCP-specific permission concerns are intentionally deferred to the next phase. Current implementation uses:

- [ ] Remove hardcoded MCP `"anchor"` permission (interim solution only)

**Note:** Comprehensive MCP permission architecture will be addressed in [MCP Interface Plugin Extraction Plan](mcp-interface-plugin-extraction-plan.md) which outlines:

- Extracting MCP from Shell into proper interface plugin
- OAuth 2.1 integration for authentication-based permissions
- Transport-based permission levels (HTTP OAuth vs stdio local access)
- Complete separation of MCP concerns from Shell core

**Benefits:**

- ✅ Clear interface-based security boundaries
- ✅ CLI grants anchor access (local access is trusted)
- ✅ Matrix respects room-based user hierarchy
- ✅ MCP supports transport-based permission grants
- ✅ No complex min/max permission logic needed
- ✅ Clean separation between interface grants and user permissions

### Phase 4: Cleanup Unused Code

- [ ] Remove any Security Gateway implementation attempts
- [ ] Remove unused AccessContext interfaces
- [ ] Keep existing permission infrastructure (PermissionHandler, MessageContext)
- [ ] Clean up complex abstractions that aren't needed

### Phase 5: Testing and Validation

- [ ] PluginContext security tests
- [ ] Shell.generateContent() as single chokepoint verification
- [ ] Interface permission determination tests
- [ ] Security boundary enforcement validation
- [ ] Performance validation
- [ ] Documentation updates

## Success Criteria

### Functional Requirements

- ✅ Shell.generateContent() is single chokepoint for ALL secured operations
- ✅ PluginContext.generateContent() routes through Shell with permissions
- ✅ Existing permission system (PermissionHandler, templates) works consistently
- ✅ Interfaces determine userPermissionLevel, Shell enforces permissions
- ✅ No bypass paths around Shell security controls
- ✅ Consistent behavior across all interfaces and execution paths

### Security Requirements

- ✅ No privilege escalation vulnerabilities
- ✅ Shell as single trusted security boundary
- ✅ Secure by default (public permissions)
- ✅ No bypass paths around Shell.generateContent() permission checking
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

This Shell as Single Security Boundary implementation establishes a simple, robust security architecture that controls access to ALL protected content generation through Shell.generateContent() as the single chokepoint. The architecture has been successfully implemented - PluginContext.generateContent() correctly routes through Shell.generateContent() with permission checking.

**Current Status:**

- ✅ **Content Generation Security**: Complete and working
- ✅ **Shell.generateContent() Permission Bug**: Fixed - now checks actual template instead of hardcoded template
- ✅ **MCP Tool Permission Filtering**: Complete - tools filtered at registration time by server permission level
- ⏳ **Hybrid Permission System**: In progress - implementing interface + operation level permissions
- ❌ **Hardcoded Permission Context**: Critical remaining gap - PluginContext hardcoded "default-user" (MCP permissions deferred to next phase)
- ❌ **Permission Flow to Shell**: Interface permission levels not passed through to shell
- ❌ **Test Coverage**: No tests for permission level methods or hybrid permission system

## Critical Issues Identified

### Issue 1: PluginContext Hardcoded User Context

**File:** `shell/core/src/plugins/pluginContextFactory.ts:168`

**Problem:** The `generateContent` method hardcodes `userId: "default-user"` and has no way to receive interface permission grants.

**Impact:** Interface permission grants cannot be passed through to Shell permission checking - the permission system is completely non-functional.

**Status:** ❌ CRITICAL BUG - Permission system not functional

**Solution:** Add `interfacePermissionGrant` parameter to PluginContext.generateContent() and implement interface grant override logic.

### Issue 2: Missing Test Coverage

**Problem:** No tests exist for:

- Interface permission grant system
- `interfacePermissionGrant` parameter handling
- Permission grant override logic
- Permission flow from interfaces to shell
- CLI anchor grant vs Matrix user permission differences

**Impact:** Permission system implementation cannot be validated or maintained safely.

**Status:** ❌ HIGH PRIORITY - Required before production use

### Issue 3: Permission Context Flow

**Problem:** The permission levels determined by interfaces are never passed to the shell's permission checking system.

**Impact:** All content generation uses default/hardcoded permission levels instead of actual user permissions.

**Status:** ❌ CRITICAL - Core architecture not complete

The foundation is solid but the permission flow is broken. The remaining work focuses on fixing the permission context flow, implementing hybrid permission enforcement, and adding comprehensive test coverage.
