# MCP Interface Plugin Extraction Plan

## Overview

This document outlines the plan to extract MCP (Model Context Protocol) integration from Shell into a proper interface plugin architecture, bringing consistency with CLI and Matrix interfaces while enabling OAuth 2.1 authentication integration.

## Problem Statement

### Current Architecture Issues

**Inconsistent Interface Patterns:**
- CLI Interface: Proper interface plugin ✅
- Matrix Interface: Proper interface plugin ✅ 
- MCP Integration: Embedded directly in Shell ❌

**Embedded MCP Problems:**
- Shell constructor contains MCP-specific logic
- MCP server lifecycle tied to Shell lifecycle
- Hardcoded permission levels for MCP operations
- No separation between MCP transport and Shell operations
- Difficult to implement OAuth-based user authentication
- Cannot easily enable/disable MCP like other interfaces

### Current MCP Integration

**File:** `shell/core/src/shell.ts` (lines 244-264)
```typescript
// MCP is initialized directly in Shell constructor
const mcpServerManager = McpServerManager.getInstance(this.logger, this.mcpServer);
mcpServerManager.initializeShellCapabilities({
  generateContent: <T = unknown>(...) => 
    this.generateContent<T>("", templateName, {
      userPermissionLevel: "anchor", // Hardcoded!
      ...(context || {}),
    }),
  // ... other capabilities
});
```

**Issues:**
- Hardcoded `"anchor"` permission level
- No user context or OAuth integration
- Tightly coupled to Shell initialization
- Cannot handle different transport types appropriately

## Solution Overview

### Extract MCP into Interface Plugin(s)

**Target Architecture:**
- CLI Interface: Plugin (anchor permissions)
- Matrix Interface: Plugin (trusted permissions + user-based)
- **MCP Interface**: Plugin (transport-based permissions + OAuth)

### MCP Plugin Options

#### Option A: Single MCP Interface Plugin
```
MCPInterfacePlugin
├── Transport Detection (STDIO vs HTTP)
├── Permission Level Assignment
│   ├── STDIO → "anchor" (trusted local)
│   └── HTTP → "public" + OAuth user mapping
├── OAuth 2.1 Integration (HTTP only)
└── Tool Registration & Filtering
```

#### Option B: Dual MCP Interface Plugins
```
MCPStdioInterfacePlugin
├── Local STDIO transport
├── "anchor" permissions (trusted)
└── No authentication needed

MCPHttpInterfacePlugin  
├── Remote HTTP transport
├── OAuth 2.1 authentication
├── User permission mapping
└── "public" default + user overrides
```

**Recommendation:** Option A (Single Plugin) for simplicity and unified MCP handling.

## OAuth 2.1 Integration Architecture

### MCP Authentication Context

Based on MCP specification research:

**OAuth 2.1 Requirements:**
- HTTP transport MUST support OAuth 2.1
- STDIO transport SHOULD use environment credentials
- Dynamic client registration (RFC7591)
- Resource indicators (RFC8707) 
- Protected resource metadata (RFC9728)

### Authentication Flow Integration

**STDIO Transport (Local):**
```
MCP Client → STDIO → MCPInterfacePlugin
├── No authentication needed
├── Interface permission: "anchor"
└── User permission: "anchor" (local process)
```

**HTTP Transport (Remote):**
```
MCP Client → OAuth 2.1 → HTTP → MCPInterfacePlugin
├── Extract user identity from OAuth token
├── Interface permission: "public" (default)
├── User permission: PermissionHandler.getUserPermissionLevel(userId)
└── Effective permission: min(interface, user)
```

### Token Processing

**OAuth Token Extraction:**
```typescript
interface MCPRequestContext {
  transport: 'stdio' | 'http';
  userId?: string; // From OAuth token
  token?: string;  // OAuth access token
  clientId?: string;
}

// In MCPInterfacePlugin
determineUserPermissionLevel(context: MCPRequestContext): UserPermissionLevel {
  if (context.transport === 'stdio') {
    return 'anchor'; // Local process is trusted
  }
  
  if (context.userId) {
    // Use existing PermissionHandler for user mapping
    return this.permissionHandler.getUserPermissionLevel(context.userId);
  }
  
  return 'public'; // Unauthenticated HTTP defaults to public
}
```

## Implementation Plan

### Phase 1: Create MCP Interface Plugin Structure

**File:** `interfaces/mcp/src/mcp-interface-plugin.ts`

```typescript
export class MCPInterfacePlugin extends IInterfacePlugin {
  private mcpServerManager: McpServerManager;
  private permissionHandler: PermissionHandler;
  
  constructor(config: MCPPluginConfig) {
    super();
    // Initialize MCP server based on transport type
  }
  
  public determineUserPermissionLevel(context: MCPRequestContext): UserPermissionLevel {
    // Transport + OAuth-based permission determination
  }
  
  async start(): Promise<void> {
    // Start MCP server and register tools
  }
  
  async stop(): Promise<void> {
    // Clean shutdown of MCP server
  }
}
```

**Configuration:**
```typescript
interface MCPPluginConfig {
  transport: 'stdio' | 'http' | 'auto';
  httpPort?: number;
  oauthConfig?: {
    issuer: string;
    clientId?: string;
    // OAuth 2.1 configuration
  };
  defaultPermissionLevel?: UserPermissionLevel; // Override default
}
```

### Phase 2: Extract MCP from Shell

**Changes to `shell/core/src/shell.ts`:**

**Remove:**
- MCP server initialization from constructor
- `McpServerManager` imports and usage
- Hardcoded MCP capability registration

**Keep:**
- Shell capabilities available for MCP plugin to register
- Plugin system that can load MCP interface plugin

**Migration Steps:**
1. Create MCP interface plugin package
2. Move `McpServerManager` to MCP plugin
3. Update Shell to be MCP-agnostic
4. Add MCP plugin to default interface list

### Phase 3: OAuth Integration

**OAuth Token Processing:**
```typescript
// In MCPInterfacePlugin
private async extractUserFromRequest(request: MCPRequest): Promise<string | undefined> {
  if (this.transport === 'stdio') {
    return undefined; // No user context for STDIO
  }
  
  const authHeader = request.headers?.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return undefined;
  }
  
  try {
    const token = authHeader.substring(7);
    const payload = await this.verifyOAuthToken(token);
    return payload.sub; // User ID from OAuth token
  } catch (error) {
    this.logger.warn('Invalid OAuth token', error);
    return undefined;
  }
}
```

**Permission Enforcement:**
```typescript
// For each MCP tool call
const userContext = await this.extractUserFromRequest(request);
const userPermissionLevel = userContext 
  ? this.determineUserPermissionLevel({ transport: 'http', userId: userContext })
  : 'public';

// Pass to Shell operations
await this.context.generateContent(templateName, {
  // ... other context
  userPermissionLevel,
});
```

### Phase 4: Transport Detection

**Auto-detection Logic:**
```typescript
private detectTransport(): 'stdio' | 'http' {
  // Check if running in STDIO mode (parent process communication)
  if (process.stdin.isTTY === false && process.stdout.isTTY === false) {
    return 'stdio';
  }
  
  // Check for HTTP configuration
  if (this.config.httpPort || process.env.MCP_HTTP_PORT) {
    return 'http';
  }
  
  // Default to STDIO for local development
  return 'stdio';
}
```

### Phase 5: Plugin Configuration & Registration

**Environment Variables:**
```bash
# MCP Transport Configuration
MCP_TRANSPORT=auto|stdio|http
MCP_HTTP_PORT=3000
MCP_DEFAULT_PERMISSION=public|trusted|anchor

# OAuth Configuration (HTTP transport only)  
MCP_OAUTH_ISSUER=https://auth.example.com
MCP_OAUTH_CLIENT_ID=mcp-client
```

**Plugin Registration:**
```typescript
// In app initialization
const mcpPlugin = new MCPInterfacePlugin({
  transport: process.env.MCP_TRANSPORT as any || 'auto',
  httpPort: process.env.MCP_HTTP_PORT ? parseInt(process.env.MCP_HTTP_PORT) : undefined,
  defaultPermissionLevel: process.env.MCP_DEFAULT_PERMISSION as UserPermissionLevel || 'public',
  oauthConfig: process.env.MCP_OAUTH_ISSUER ? {
    issuer: process.env.MCP_OAUTH_ISSUER,
    clientId: process.env.MCP_OAUTH_CLIENT_ID,
  } : undefined,
});

// Add to interface plugins list
const interfaces = [cliPlugin, matrixPlugin, mcpPlugin];
```

## Permission Architecture

### Interface-Level Permissions

**MCP Interface Permission Levels:**
- **STDIO Transport**: `"anchor"` (local process is trusted)
- **HTTP Transport**: `"public"` (remote clients are untrusted by default)
- **Configuration Override**: Allow admin to set specific MCP instance permission level

### User-Level Permissions

**STDIO Transport:**
- All operations inherit interface level (`"anchor"`)
- No user differentiation (single local process)

**HTTP Transport:**
- **Authenticated Users**: OAuth token → user ID → PermissionHandler lookup
- **Unauthenticated Users**: Default to `"public"`
- **Effective Permission**: `min(interfaceLevel, userLevel)`

### Examples

**Local STDIO MCP:**
```typescript
interfaceLevel = "anchor"
userLevel = "anchor" (implicit)
effectiveLevel = "anchor"
// Result: Full access to all tools and templates
```

**Remote HTTP MCP (Authenticated User):**
```typescript
interfaceLevel = "public"
userLevel = "trusted" (from PermissionHandler)
effectiveLevel = "public" // min(public, trusted)
// Result: Only public tools and templates
```

**Remote HTTP MCP (Admin Override):**
```typescript
interfaceLevel = "trusted" (configured)
userLevel = "trusted" (from PermissionHandler) 
effectiveLevel = "trusted" // min(trusted, trusted)
// Result: Trusted tools and templates
```

## Migration Strategy

### Backward Compatibility

**Phase 1: Dual Support**
- Keep existing MCP in Shell (deprecated)
- Add new MCP interface plugin (opt-in)
- Environment variable to choose: `USE_MCP_PLUGIN=true`

**Phase 2: Default Switch**
- New MCP plugin becomes default
- Old MCP in Shell prints deprecation warning
- Documentation updated to use plugin approach

**Phase 3: Remove Legacy**
- Remove MCP code from Shell entirely
- MCP plugin is the only option
- Breaking change with major version bump

### Configuration Migration

**Current (Shell-embedded):**
```typescript
// MCP automatically starts with Shell
// No configuration options
// Hardcoded "anchor" permissions
```

**New (Plugin-based):**
```typescript
// Explicit plugin configuration
const mcpConfig = {
  transport: 'auto',
  defaultPermissionLevel: 'public',
  // OAuth configuration for HTTP
};
```

**Migration Guide:**
- Document environment variable equivalents
- Provide configuration conversion tool
- Clear upgrade path in documentation

## Testing Strategy

### Unit Tests

**MCP Interface Plugin Tests:**
```typescript
describe('MCPInterfacePlugin', () => {
  describe('transport detection', () => {
    it('should detect STDIO transport');
    it('should detect HTTP transport'); 
    it('should default to STDIO when uncertain');
  });
  
  describe('permission determination', () => {
    it('should return anchor for STDIO transport');
    it('should return public for unauthenticated HTTP');
    it('should extract user from OAuth token');
    it('should map user to permission level');
  });
  
  describe('OAuth integration', () => {
    it('should verify OAuth tokens');
    it('should handle invalid tokens gracefully');
    it('should extract user ID from token payload');
  });
});
```

### Integration Tests

**End-to-End MCP Tests:**
```typescript
describe('MCP Integration', () => {
  describe('STDIO transport', () => {
    it('should provide anchor-level access');
    it('should register all tools');
    it('should allow all template access');
  });
  
  describe('HTTP transport', () => {
    it('should require authentication for trusted operations');
    it('should filter tools by permission level');
    it('should respect OAuth user permissions');
  });
  
  describe('permission enforcement', () => {
    it('should enforce min(interface, user) permissions');
    it('should block unauthorized template access');
    it('should filter tools correctly');
  });
});
```

### Manual Testing

**STDIO MCP Testing:**
```bash
# Test local STDIO MCP
bun run mcp-stdio-server
# Verify anchor-level access

# Test tool availability
echo '{"method": "tools/list"}' | bun run mcp-stdio-server
# Should show all tools (anchor level)
```

**HTTP MCP Testing:**
```bash
# Start HTTP MCP server
MCP_TRANSPORT=http MCP_HTTP_PORT=3000 bun run mcp-http-server

# Test unauthenticated access
curl http://localhost:3000/tools/list
# Should show only public tools

# Test OAuth-authenticated access  
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/tools/list
# Should show tools based on user permission level
```

## File Structure

### New Package Structure
```
interfaces/mcp/
├── package.json
├── src/
│   ├── mcp-interface-plugin.ts      # Main plugin class
│   ├── oauth/
│   │   ├── token-verifier.ts        # OAuth token verification
│   │   └── user-extractor.ts        # User ID extraction
│   ├── transport/
│   │   ├── stdio-transport.ts       # STDIO-specific logic
│   │   └── http-transport.ts        # HTTP-specific logic
│   ├── config.ts                    # Plugin configuration
│   └── index.ts                     # Public exports
├── test/
│   ├── mcp-interface-plugin.test.ts
│   ├── oauth/
│   │   └── token-verifier.test.ts
│   └── integration/
│       └── mcp-integration.test.ts
└── README.md
```

### Modified Files
```
shell/core/src/
├── shell.ts                         # Remove MCP initialization
├── mcp/                             # Move to interfaces/mcp/
│   ├── mcpServerManager.ts          # → interfaces/mcp/src/
│   ├── index.ts                     # → interfaces/mcp/src/
│   └── adapters.ts                  # → interfaces/mcp/src/
```

## Success Criteria

### Functional Requirements

- ✅ MCP functionality unchanged for end users
- ✅ STDIO transport provides anchor-level access (local)
- ✅ HTTP transport supports OAuth 2.1 authentication 
- ✅ User permissions correctly extracted from OAuth tokens
- ✅ Tool filtering works based on effective permission levels
- ✅ Template access enforcement works correctly
- ✅ MCP can be enabled/disabled like other interface plugins

### Architecture Requirements

- ✅ MCP fully extracted from Shell core
- ✅ Consistent interface plugin pattern across all interfaces
- ✅ Clean separation between transport and business logic
- ✅ Pluggable OAuth providers for HTTP transport
- ✅ Configurable permission levels for different deployments
- ✅ No breaking changes to existing MCP clients

### Security Requirements

- ✅ OAuth 2.1 compliance for HTTP transport
- ✅ Secure token verification and user extraction
- ✅ Appropriate default permission levels (public for HTTP)
- ✅ No privilege escalation vulnerabilities
- ✅ Secure handling of authentication failures
- ✅ Transport-appropriate security models

## Future Enhancements

### Short Term
- Support for multiple OAuth providers
- Token refresh handling for long-lived connections
- MCP client registration and management UI
- Detailed audit logging for MCP operations

### Long Term  
- Multi-tenant MCP hosting with per-tenant permissions
- Dynamic permission policy updates via API
- Integration with external identity providers
- Advanced rate limiting and quota management
- MCP federation and service discovery

## Conclusion

Extracting MCP into a proper interface plugin will bring architectural consistency, enable OAuth integration, and provide appropriate transport-based security models. The phased migration approach ensures backward compatibility while enabling new OAuth-based authentication capabilities for HTTP transport.

This refactoring aligns MCP with the existing interface plugin pattern used by CLI and Matrix, making the overall system more maintainable and extensible.