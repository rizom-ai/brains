# MCP Inspector Quick Guide

## Local Development Setup

### 1. Start your Brain app with MCP auth token:

```bash
# In your .env file:
MCP_AUTH_TOKEN=test-token-12345678901234567890123456789012

# Start the app:
bun run dev
```

### 2. Connect with MCP Inspector:

1. Go to: https://modelcontextprotocol.io/inspector
2. Configure connection:
   - **Server URL**: `http://localhost:3333/mcp`
   - **Transport**: Streamable HTTP
   - **Authentication** (use the separate fields):
     - **Header Name**: `Authorization`
     - **Bearer Token**: `test-token-12345678901234567890123456789012`

   Note: MCP Inspector will automatically combine these into the header:

   ```
   Authorization: Bearer test-token-12345678901234567890123456789012
   ```

3. Click "Connect"

### 3. Test the connection:

Once connected, you can:

- View available tools (system:query, link:capture, etc.)
- Execute tool calls
- View resources
- Test your MCP implementation

## Production Setup

For production servers:

- **Server URL**: `https://api.yourdomain.com/mcp`
- **Transport**: Streamable HTTP
- **Authentication**:
  - **Header Name**: `Authorization`
  - **Bearer Token**: `your-production-token-here`

## Troubleshooting

### Connection Refused

- Check the server is running: `curl http://localhost:3333/health`
- Verify port 3333 is not blocked

### Authentication Failed

- Verify the token matches exactly what's in your .env file
- Check the Authorization header format: `Bearer <token>`
- No extra spaces before/after the token

### CORS Issues

- The server includes CORS headers by default
- If using a custom domain, ensure it's properly configured

## Security Notes

- **Never share your production token**
- **Use different tokens for dev/staging/production**
- **Rotate tokens regularly**
- **Always use HTTPS in production**
