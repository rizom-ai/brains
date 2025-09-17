# MCP Authentication Implementation Plan

## Overview

Implement authentication for MCP HTTP transport to securely expose it from our server and Docker containers.

## Authentication Approach

### 1. **Bearer Token Authentication** (Recommended)

- Simple, stateless authentication using Bearer tokens
- Tokens configured via environment variables
- Easy to implement and manage
- Works well with Docker deployments
- **Fully compatible with MCP Inspector** (has built-in Bearer token field)

### 2. Implementation Steps

#### Phase 1: Basic Token Authentication

1. **Add authentication middleware** to HTTP server:
   - Check for `Authorization: Bearer <token>` header
   - Validate against configured token(s)
   - Return 401 Unauthorized for invalid/missing tokens

2. **Environment configuration**:
   - Add `MCP_AUTH_TOKEN` environment variable
   - Support multiple tokens: `MCP_AUTH_TOKENS` (comma-separated)
   - Optional: `MCP_AUTH_ENABLED` flag (default: true for production)

3. **Update deployment configuration**:
   - Add MCP port (3333) to Caddy configuration
   - Configure firewall rules (already exposed)
   - Set auth tokens in production environment

#### Phase 2: Enhanced Security (Future)

- Rate limiting per token
- Token rotation mechanism
- Audit logging for authentication events
- Optional OAuth2 support

## File Changes Required

1. **interfaces/mcp/src/transports/http-server.ts**
   - Add authentication middleware
   - Check Bearer token on all endpoints except /health

2. **interfaces/mcp/src/config.ts**
   - Add auth configuration schema
   - Parse environment variables

3. **deploy/providers/hetzner/deploy-app.sh**
   - Update Caddy configuration to proxy MCP
   - Add MCP endpoint with proper headers

4. **.env files**
   - Add MCP_AUTH_TOKEN examples
   - Document authentication setup

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
// Basic structure
interface AuthConfig {
  enabled: boolean;
  tokens: string[];
}

// Middleware function
function authMiddleware(req, res, next) {
  // Skip auth for health check
  if (req.path === "/health") {
    return next();
  }

  // Check if auth is enabled
  if (!authConfig.enabled) {
    return next();
  }

  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.substring(7);
  if (!authConfig.tokens.includes(token)) {
    return res.status(401).json({ error: "Invalid token" });
  }

  next();
}
```

### Environment Variables

```bash
# Single token
MCP_AUTH_TOKEN=your-secret-token-here

# Multiple tokens (comma-separated)
MCP_AUTH_TOKENS=token1,token2,token3

# Enable/disable auth (default: true in production)
MCP_AUTH_ENABLED=true
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

## Security Notes

1. **Token Rotation**: Implement regular token rotation (e.g., monthly)
2. **Token Scope**: Consider different tokens for different access levels
3. **Monitoring**: Log authentication attempts for security auditing
4. **HTTPS Only**: Never expose MCP over plain HTTP in production
5. **Environment Security**: Ensure .env files are never committed to git
