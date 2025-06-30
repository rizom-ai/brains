# Permission System Implementation Plan

## Overview

This document outlines the implementation plan for centralizing permission checking in the Brain's shell core, moving away from interface-level permission handling to ensure consistent security enforcement across all interfaces.

## Current State Analysis

### What Exists

- `UserPermissionLevel` type: `"anchor" | "trusted" | "public"`
- `PermissionHandler` class in `shared/utils/src/permission-handler.ts` with Matrix-specific logic
- `MessageContext` interface with optional `userPermissionLevel` field
- Tool visibility system: `"public" | "anchor"` on `PluginTool`
- Permission checking scattered across interfaces (Matrix has TODO comment)

### Problem Statement

Permission checking is currently done at the interface level instead of the shell level, creating:

- **Security inconsistencies** between different interfaces
- **Code duplication** of permission logic
- **Maintenance burden** when updating permission rules
- **Potential security gaps** where interfaces might bypass checks

## Implementation Strategy

### Core Principle

**Interfaces determine user identity, Shell enforces permissions**

### Permission Flow

```
User Request → Interface (determines userId + permission level) →
MessageContext → Shell.generateContent() → Permission Check →
Tool Filtering → Template Execution (if authorized)
```

## Implementation Plan

### Phase 1: Planning and Documentation ✓

- [x] Create this implementation plan document
- [x] Define clear permission model and enforcement points

### Phase 2: Shell-Level Permission Integration

#### 2.1 Add PermissionHandler to Shell Core

**File:** `shell/core/src/shell.ts`

**Changes:**

- Import and initialize `PermissionHandler` in Shell constructor
- Add anchor user ID configuration (from environment/config)
- Provide methods for interfaces to query user permission levels

**Configuration:**

```typescript
// Environment variables
BRAIN_ANCHOR_USER_ID=user@example.com
BRAIN_TRUSTED_USERS=user1@example.com,user2@example.com
```

#### 2.2 Modify Shell's generateContent Method

**File:** `shell/core/src/shell.ts`

**Changes:**

- Extract `userPermissionLevel` from `MessageContext`
- Implement permission checking before template processing
- Filter available tools based on user permission level
- Return appropriate error for insufficient permissions
- Keep templates permission-agnostic

**Implementation:**

```typescript
async generateContent<T>(templateName: string, context?: GenerationContext): Promise<T> {
  // Extract user permission level from context
  const userLevel = context?.data?.userPermissionLevel || 'public';

  // Check template access permissions
  if (!this.permissionHandler.canUseTemplate(userLevel, templateName)) {
    throw new PermissionError(`Insufficient permissions for template: ${templateName}`);
  }

  // Filter tools based on permission level
  const availableTools = this.permissionHandler.filterToolsByPermission(
    this.getAllTools(),
    userLevel
  );

  // Proceed with template processing using filtered tools
  return this.processTemplateWithTools(templateName, context, availableTools);
}
```

### Phase 3: Interface Permission Assignment

#### 3.1 Update MessageInterfacePlugin Base Class

**File:** `shared/plugin-utils/src/message-interface-plugin.ts`

**Changes:**

- Add abstract method `determineUserPermissionLevel(userId: string): UserPermissionLevel`
- Modify `processInput` to populate `userPermissionLevel` in MessageContext
- Ensure all interfaces implement permission determination

#### 3.2 CLI Interface Implementation

**File:** `interfaces/cli/src/cli-interface.ts`

**Permission Level:** Always `"anchor"` (local access = full control)

**Implementation:**

```typescript
protected determineUserPermissionLevel(_userId: string): UserPermissionLevel {
  return 'anchor'; // CLI access is always anchor level
}
```

#### 3.3 MCP Interface Implementation

**File:** `interfaces/mcp-server/src/mcp-interface.ts`

**Permission Level:** Always `"anchor"` (local tools access = full control)

**Implementation:**

```typescript
protected determineUserPermissionLevel(_userId: string): UserPermissionLevel {
  return 'anchor'; // MCP tools access is always anchor level
}
```

#### 3.4 Matrix Interface Implementation

**File:** `interfaces/matrix/src/matrix-interface.ts`

**Permission Level:** Dynamic based on user ID

- Anchor user gets `"anchor"`
- Configurable trusted users get `"trusted"`
- Everyone else gets `"public"`

**Changes:**

- Remove existing permission checking logic
- Implement `determineUserPermissionLevel` to query shell's PermissionHandler
- Remove Matrix-specific PermissionHandler instantiation

**Implementation:**

```typescript
protected determineUserPermissionLevel(userId: string): UserPermissionLevel {
  // Query shell's permission handler
  return this.context.getPermissionHandler().getUserPermissionLevel(userId);
}
```

### Phase 4: Generalize PermissionHandler

#### 4.1 Update PermissionHandler Class

**File:** `shared/utils/src/permission-handler.ts`

**Changes:**

- Remove Matrix-specific logic and comments
- Make it interface-agnostic
- Add template permission checking capabilities
- Enhance tool filtering logic

### Phase 5: Comprehensive Testing Strategy

#### 5.1 Unit Tests for PermissionHandler

**File:** `shared/utils/test/permission-handler.test.ts`

**Test Coverage:**

- User permission level determination
- Tool filtering by permission level
- Template access permissions
- Trusted user management
- Edge cases and error conditions

#### 5.2 Shell Permission Enforcement Tests

**File:** `shell/core/test/permission-enforcement.test.ts`

**Test Coverage:**

- `generateContent` with different permission levels
- Tool filtering during template execution
- Permission rejection scenarios
- Error handling for insufficient permissions
- Template access control

#### 5.3 Interface Permission Tests

**CLI Tests** (`interfaces/cli/test/permission.test.ts`):

- Always returns "anchor" permission level
- Proper MessageContext population

**Matrix Tests** (`interfaces/matrix/test/permission.test.ts`):

- Correct permission level based on user ID
- Anchor user identification
- Trusted user handling
- Public user restrictions

**MCP Tests** (`interfaces/mcp-server/test/permission.test.ts`):

- Always returns "anchor" permission level
- Tool access verification

#### 5.4 Integration Tests

**File:** `shell/integration-tests/test/permission-integration.test.ts`

**Test Coverage:**

- End-to-end permission flow testing
- Cross-interface consistency verification
- Security boundary validation
- Privilege escalation prevention
- Permission bypass attempts

#### 5.5 Security Tests

**Test Scenarios:**

- Unauthorized template access attempts
- Tool visibility bypass attempts
- Permission level spoofing
- Context manipulation attacks
- Interface switching privilege escalation

## Implementation Timeline

### Phase 1: Foundation (Current)

- [x] Create implementation plan
- [x] Update todo tracking

### Phase 2: Core Implementation (Next)

- [ ] Generalize PermissionHandler class
- [ ] Add PermissionHandler to Shell core
- [ ] Implement shell-level permission enforcement
- [ ] Update MessageInterfacePlugin base class

### Phase 3: Interface Updates

- [ ] Update CLI interface for anchor permissions
- [ ] Update MCP interface for anchor permissions
- [ ] Update Matrix interface to use shell permissions
- [ ] Remove Matrix-specific permission code

### Phase 4: Testing

- [ ] Create comprehensive unit tests
- [ ] Implement integration tests
- [ ] Add security validation tests
- [ ] Performance testing for permission checks

### Phase 5: Validation

- [ ] End-to-end testing across all interfaces
- [ ] Security review and validation
- [ ] Documentation updates
- [ ] Performance impact assessment

## Success Criteria

### Functional Requirements

- ✅ All permission checks happen at shell level
- ✅ Interfaces only determine user identity
- ✅ Templates remain permission-agnostic
- ✅ Consistent behavior across all interfaces
- ✅ Tool filtering based on permission levels

### Security Requirements

- ✅ No privilege escalation vulnerabilities
- ✅ Proper access control enforcement
- ✅ Secure by default (public permissions)
- ✅ Audit trail for permission decisions

### Quality Requirements

- ✅ Comprehensive test coverage (>90%)
- ✅ Clear error messages for permission denials
- ✅ Minimal performance impact (<5ms per request)
- ✅ Maintainable and extensible code

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

- Permission caching for performance
- Audit logging for permission decisions
- Granular template-level permissions

### Long Term

- Role-based access control (RBAC)
- Dynamic permission delegation
- External permission providers integration

## Conclusion

This implementation will establish a robust, centralized permission system that ensures consistent security enforcement across all Brain interfaces while maintaining clean separation of concerns and comprehensive test coverage.
