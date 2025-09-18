# MCP Authentication Implementation Plan

## Overview

Implement authentication for MCP HTTP transport to securely expose it from our server and Docker containers.

## Authentication Approach

### 1. **Bearer Token Authentication** (Recommended)

- Simple, stateless authentication using Bearer tokens
- Single shared token configured via environment variable
- Authenticated users get "anchor" (full) permission level
- Easy to implement and manage
- Works well with Docker deployments
- **Fully compatible with MCP Inspector** (has built-in Bearer token field)
- **Easy to extend later** with multi-token/multi-level support

### 2. Implementation Steps

#### Phase 1: Basic Token Authentication

1. **Add authentication middleware** to HTTP server:
   - Check for `Authorization: Bearer <token>` header
   - Validate against configured token(s)
   - Return 401 Unauthorized for invalid/missing tokens

2. **Environment configuration**:
   - Add `MCP_AUTH_TOKEN` environment variable (single shared secret)
   - Optional: `MCP_AUTH_ENABLED` flag (default: true for production, false for development)

3. **Update deployment configuration**:
   - Add MCP port (3333) to Caddy configuration
   - Configure firewall rules (already exposed)
   - Set auth tokens in production environment

#### Phase 2: Multi-Token Support (Future)

- Multiple tokens with different permission levels (anchor, trusted, public)
- Token storage in database or Redis
- Token generation and management API
- Token expiration and rotation
- Per-token rate limiting
- Audit logging for authentication events

#### Phase 3: Advanced Security (Future)

- OAuth2/OpenID Connect support
- JWT tokens with claims
- API key management UI
- Token scopes and fine-grained permissions

## File Changes Required

1. **apps/\*/brain.config.ts**
   - Read MCP_AUTH_TOKEN from environment
   - Pass auth config to MCPInterface constructor
   - Example:
     ```typescript
     new MCPInterface({
       transport: "http",
       httpPort: 3333,
       auth: {
         enabled: process.env.NODE_ENV === "production",
         token: process.env.MCP_AUTH_TOKEN,
       },
     });
     ```

2. **interfaces/mcp/src/config.ts**
   - Add auth configuration schema (no env var access here)
   - Auth config passed from app level

3. **interfaces/mcp/src/transports/http-server.ts**
   - Add authentication middleware
   - Check Bearer token on all endpoints except /health
   - Receive auth config through constructor

4. **interfaces/mcp/src/mcp-interface.ts**
   - Pass auth config to HTTP server constructor

5. **deploy/providers/hetzner/deploy-app.sh**
   - Update Caddy configuration to proxy MCP
   - Add MCP endpoint with proper headers

6. **.env files**
   - Add MCP_AUTH_TOKEN examples
   - Document authentication setup

## Architecture Benefits

This approach keeps the MCP package pure:

- **No environment variable access in MCP package** - Configuration passed from app level
- **Testable** - Easy to test with mock auth configurations
- **Consistent** - Follows the existing plugin configuration pattern
- **Flexible** - Each app can have different auth settings
- **Clean** - Separation of concerns between app config and plugin logic

## Security Considerations

- Tokens stored as environment variables (not in code)
- HTTPS-only in production (via Caddy)
- No session management (stateless)
- Human-in-the-loop controls remain in client
- Rate limiting to prevent brute force

## Testing

- Unit tests for auth middleware
- Integration tests with valid/invalid tokens
- Docker deployment verification
- Caddy proxy testing
- MCP Inspector compatibility testing

## Implementation Details

### Authentication Middleware

```typescript
// In config.ts - pure schema, no env vars
export const mcpConfigSchema = z.object({
  transport: z.enum(["stdio", "http"]).default("http"),
  httpPort: z.number().default(3333),
  auth: z
    .object({
      enabled: z.boolean().default(false),
      token: z.string().optional(),
    })
    .optional(),
});

// In http-server.ts - receives config, no env vars
class StreamableHTTPServer {
  constructor(config: StreamableHTTPServerConfig) {
    this.authConfig = config.auth ?? { enabled: false };
    // ...
  }

  private authMiddleware = (req, res, next) => {
    // Skip auth for health check
    if (req.path === "/health" || req.path === "/status") {
      return next();
    }

    // Check if auth is enabled
    if (!this.authConfig.enabled || !this.authConfig.token) {
      return next();
    }

    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.substring(7);
    if (token !== this.authConfig.token) {
      return res.status(401).json({ error: "Invalid token" });
    }

    // Authenticated requests get anchor permission
    this.mcpServer?.setPermissionLevel("anchor");
    next();
  };
}
```

### Environment Variables

Environment variables are read at the app level (brain.config.ts), not in the MCP package:

```bash
# In .env files
MCP_AUTH_TOKEN=your-secret-token-here
NODE_ENV=production  # Auth enabled by default in production
```

```typescript
// In brain.config.ts
new MCPInterface({
  transport: "http",
  httpPort: 3333,
  auth: {
    enabled: process.env.NODE_ENV === "production",
    token: process.env.MCP_AUTH_TOKEN,
  },
});
```

### Caddy Configuration

```
# MCP API endpoint
mcp.yourdomain.com {
    reverse_proxy personal-brain:3333

    header {
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
    }

    # Optional: Basic rate limiting
    rate_limit {
        zone dynamic 10r/s
    }
}
```

## MCP Inspector Compatibility

MCP Inspector has built-in support for Bearer token authentication:

1. **Transport Selection**: Select "SSE" or "Streamable HTTP" in the sidebar
2. **URL Configuration**: Enter the server URL (e.g., `https://mcp.yourdomain.com`)
3. **Token Entry**: Paste token in the "Authentication > Bearer" field
4. **Connection**: Click Connect to establish authenticated connection

The inspector will:

- Automatically add `Authorization: Bearer <token>` header to all requests
- Save token in browser local storage for future connections
- Support token refresh if implemented

## Rollout Plan

1. **Development Phase**
   - Implement auth middleware with bypass for local development
   - Add configuration schema and environment parsing
   - Write unit tests

2. **Testing Phase**
   - Test with single token
   - Test with multiple tokens
   - Test auth bypass in development
   - Test 401 responses
   - Test with MCP Inspector

3. **Deployment Phase**
   - Generate secure tokens for production
   - Update production .env files
   - Deploy to Hetzner with auth enabled
   - Test MCP access with valid tokens

4. **Documentation Phase**
   - Update deployment docs with auth setup
   - Add auth token generation guide
   - Document client configuration
   - Add MCP Inspector connection guide

## Token Generation

Recommended approach for generating secure tokens:

```bash
# Generate a secure random token
openssl rand -hex 32

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or using uuidgen
uuidgen | tr -d '-' | tr '[:upper:]' '[:lower:]'
```

## Client Configuration

### For MCP Inspector

1. Open MCP Inspector at https://modelcontextprotocol.io/inspector
2. Select "Streamable HTTP" transport
3. Enter server URL
4. Paste token in "Authentication > Bearer" field
5. Connect

### For Programmatic Clients

```javascript
// Example client configuration
const client = new MCPClient({
  transport: "http",
  url: "https://mcp.yourdomain.com",
  headers: {
    Authorization: `Bearer ${process.env.MCP_CLIENT_TOKEN}`,
  },
});
```

### For Claude Desktop

```json
{
  "mcpServers": {
    "brain": {
      "command": "curl",
      "args": [
        "-H",
        "Authorization: Bearer YOUR_TOKEN_HERE",
        "https://mcp.yourdomain.com"
      ]
    }
  }
}
```

## Migration Path to Multi-Token Support

When ready to add multi-token support, the migration will be simple:

1. **No client changes needed** - Still uses `Authorization: Bearer <token>`
2. **Middleware enhancement** - Add token lookup logic:
   ```typescript
   // Phase 2: Multi-token support
   const tokenData = await tokenStore.lookup(token);
   if (tokenData) {
     mcpService.setPermissionLevel(tokenData.permissionLevel);
     next();
   }
   ```
3. **Add token storage** - Database table or Redis
4. **Add management API** - Endpoints to create/revoke tokens

The key is that the HTTP interface remains stable, so existing integrations continue working.

## Security Notes

1. **Token Security**: Generate strong, random tokens (at least 32 characters)
2. **Token Rotation**: Change the token periodically
3. **Monitoring**: Log authentication attempts for security auditing
4. **HTTPS Only**: Never expose MCP over plain HTTP in production
5. **Environment Security**: Ensure .env files are never committed to git
