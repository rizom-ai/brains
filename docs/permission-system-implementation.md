# Permission System Implementation Plan

## Overview

This document outlines the implementation plan for creating a unified security system in the Brain architecture. The system uses a Security Gateway abstraction to handle ALL permission decisions - templates, tools, resources, and future secured operations - through a single, consistent interface.

## Current State Analysis

### What Exists

- `UserPermissionLevel` type: `"anchor" | "trusted" | "public"`
- `PermissionHandler` class in `shared/utils/src/permission-handler.ts`
- `MessageContext` interface with optional `userPermissionLevel` field
- Template permission system: `requiredPermission` field on templates
- Tool visibility system: `"public" | "anchor"` on `PluginTool`
- Shell-level permission checking for queries (partial implementation)

### Problem Statement

Permission checking is scattered across multiple systems and layers, creating:

- **Multiple permission systems** (templates, tools, resources) with different patterns
- **Security gaps** where different execution paths bypass permission checks
- **Inconsistent enforcement** between interfaces and execution contexts
- **Code duplication** of permission logic across components
- **Maintenance burden** when updating security rules
- **Missing abstraction** for unified security decisions

## New Architecture: Security Gateway Pattern

### Core Principle

**Single Security Gateway controls access to ALL protected resources**

### Key Abstractions

#### AccessContext

```typescript
interface AccessContext {
  userId: string;
  userPermissionLevel: UserPermissionLevel;
  interfaceType: string;
  sessionId: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}
```

#### SecurityGateway

```typescript
interface SecurityGateway {
  canAccessTemplate(context: AccessContext, template: Template): boolean;
  canExecuteTool(context: AccessContext, tool: PluginTool): boolean;
  canAccessResource(context: AccessContext, resource: PluginResource): boolean;
  filterAvailableCapabilities(
    context: AccessContext,
    capabilities: PluginCapabilities,
  ): PluginCapabilities;
  createAccessContext(
    userId: string,
    interfaceType: string,
    sessionId: string,
  ): AccessContext;
}
```

### Unified Permission Flow

```
User Request → Interface (creates AccessContext) →
SecurityGateway.canAccess*() → Authorized Operation Execution
```

## Implementation Plan

### Phase 1: Foundation and Analysis ✓

- [x] Create this implementation plan document
- [x] Analyze existing permission systems and identify gaps
- [x] Design Security Gateway architecture
- [x] Update implementation plan with unified approach

### Phase 2: Security Gateway Implementation

#### 2.1 Create AccessContext and SecurityGateway Interfaces

**File:** `shared/types/src/security.ts` (new file)

**Create Core Abstractions:**

```typescript
export interface AccessContext {
  userId: string;
  userPermissionLevel: UserPermissionLevel;
  interfaceType: string;
  sessionId: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface SecurityGateway {
  canAccessTemplate(context: AccessContext, template: Template): boolean;
  canExecuteTool(context: AccessContext, tool: PluginTool): boolean;
  canAccessResource(context: AccessContext, resource: PluginResource): boolean;
  filterAvailableCapabilities(
    context: AccessContext,
    capabilities: PluginCapabilities,
  ): PluginCapabilities;
  createAccessContext(
    userId: string,
    interfaceType: string,
    sessionId: string,
  ): AccessContext;
}
```

#### 2.2 Implement SecurityGateway Class

**File:** `shared/utils/src/security-gateway.ts` (new file)

**Implementation:**

```typescript
export class SecurityGatewayImpl implements SecurityGateway {
  private permissionHandler: PermissionHandler;

  constructor(permissionHandler: PermissionHandler) {
    this.permissionHandler = permissionHandler;
  }

  canAccessTemplate(context: AccessContext, template: Template): boolean {
    return this.permissionHandler.canUseTemplate(
      context.userPermissionLevel,
      template.requiredPermission,
    );
  }

  canExecuteTool(context: AccessContext, tool: PluginTool): boolean {
    if (context.userPermissionLevel === "anchor") return true;
    return tool.visibility === "public";
  }

  // ... other methods
}
```

#### 2.3 Integrate SecurityGateway at Chokepoints

**Files to Update:**

- `shell/content-generator/src/content-generator.ts` - Template access control
- `shell/core/src/mcp/mcpServerManager.ts` - Tool execution control
- Plugin resource handlers - Resource access control

### Phase 3: Interface Integration with AccessContext

#### 3.1 Update Interface Base Classes

**File:** `shared/plugin-utils/src/base-plugin.ts`

**Changes:**

- Add `determineUserPermissionLevel(userId: string): UserPermissionLevel` method to BasePlugin
- Default implementation returns "public" for safety
- Interfaces override to implement their permission model

**File:** `shared/plugin-utils/src/message-interface-plugin.ts`

**Changes:**

- Update `processInput` to create AccessContext using SecurityGateway
- Pass AccessContext through to secured operations
- Remove MessageContext.userPermissionLevel (replaced by AccessContext)

#### 3.2 CLI Interface Implementation

**File:** `interfaces/cli/src/cli-interface.ts`

**AccessContext Creation:** Always `"anchor"` level (local access = full control)

**Implementation:**

```typescript
public determineUserPermissionLevel(_userId: string): UserPermissionLevel {
  return 'anchor'; // CLI access is always anchor level
}
```

#### 3.3 MCP Interface Implementation

**File:** `interfaces/mcp-server/src/mcp-interface.ts`

**AccessContext Creation:** Always `"anchor"` level (local tools access = full control)

**Implementation:**

```typescript
public determineUserPermissionLevel(_userId: string): UserPermissionLevel {
  return 'anchor'; // MCP tools access is always anchor level
}
```

#### 3.4 Matrix Interface Implementation

**File:** `interfaces/matrix/src/matrix-interface.ts`

**AccessContext Creation:** Dynamic based on user ID using Shell's SecurityGateway

**Changes:**

- Remove existing Matrix-specific permission logic
- Implement `determineUserPermissionLevel` using Shell's PermissionHandler
- Remove Matrix-specific PermissionHandler instantiation

**Implementation:**

```typescript
public determineUserPermissionLevel(userId: string): UserPermissionLevel {
  // Query shell's permission handler
  return this.context.getPermissionHandler().getUserPermissionLevel(userId);
}
```

### Phase 4: Remove Legacy Permission Systems

#### 4.1 Clean Up Scattered Permission Code

**Files to Clean:**

- Remove permission checking from `shell/core/src/shell.ts` query method
- Remove MessageContext.userPermissionLevel field (replaced by AccessContext)
- Consolidate PermissionHandler functionality into SecurityGateway

### Phase 5: Comprehensive Testing Strategy

#### 5.1 SecurityGateway Unit Tests

**File:** `shared/utils/test/security-gateway.test.ts`

**Test Coverage:**

- AccessContext creation and validation
- Template access permission checking
- Tool execution permission checking
- Resource access permission checking
- Capability filtering
- Edge cases and error conditions

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

- Unauthorized template access attempts via all paths
- Tool visibility bypass attempts
- Resource access without proper permissions
- Permission level spoofing
- Context manipulation attacks
- Interface switching privilege escalation
- SecurityGateway bypass attempts

## Implementation Timeline

### Phase 1: Foundation ✓

- [x] Analyze existing permission systems and gaps
- [x] Design Security Gateway architecture
- [x] Create comprehensive implementation plan
- [x] Update todo tracking

### Phase 2: Security Gateway Implementation (Next)

- [ ] Create AccessContext and SecurityGateway interfaces
- [ ] Implement SecurityGatewayImpl class
- [ ] Integrate SecurityGateway at chokepoints:
  - [ ] ContentGenerator for template access
  - [ ] MCP tool execution
  - [ ] Plugin resource access

### Phase 3: Interface Integration

- [ ] Update BasePlugin with determineUserPermissionLevel method
- [ ] Update MessageInterfacePlugin for AccessContext
- [ ] Implement interface-specific permission determination:
  - [ ] CLI interface (anchor level)
  - [ ] MCP interface (anchor level)
  - [ ] Matrix interface (dynamic levels)

### Phase 4: Legacy Cleanup

- [ ] Remove scattered permission checks
- [ ] Clean up duplicate permission code
- [ ] Remove MessageContext.userPermissionLevel
- [ ] Consolidate into SecurityGateway

### Phase 5: Testing and Validation

- [ ] SecurityGateway unit tests
- [ ] Integration tests across all chokepoints
- [ ] Interface security tests
- [ ] Security validation and penetration testing
- [ ] Performance validation
- [ ] Documentation updates

## Success Criteria

### Functional Requirements

- ✅ Single SecurityGateway controls ALL permission decisions
- ✅ AccessContext propagates through all secured operations
- ✅ Unified permission system for templates, tools, and resources
- ✅ Interfaces create AccessContext, SecurityGateway enforces permissions
- ✅ No bypass paths around security controls
- ✅ Consistent behavior across all interfaces and execution paths

### Security Requirements

- ✅ No privilege escalation vulnerabilities
- ✅ Centralized access control enforcement
- ✅ Secure by default (public permissions)
- ✅ Protection against all known bypass patterns
- ✅ Audit trail for all permission decisions
- ✅ Defense in depth with single chokepoint architecture

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

This Security Gateway implementation establishes a unified, robust security architecture that controls access to ALL protected resources (templates, tools, resources) through a single chokepoint. The design eliminates security gaps, reduces code duplication, and provides a maintainable foundation for comprehensive access control across the entire Brain ecosystem. The AccessContext abstraction ensures consistent security enforcement regardless of interface or execution path, while the SecurityGateway provides a clean extension point for future security enhancements.
