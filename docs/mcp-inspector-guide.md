# MCP Inspector Quick Guide

Use MCP Inspector to inspect the HTTP MCP endpoint exposed by a running brain.

## Local OAuth setup

### 1. Start the brain

```bash
cd mybrain
brain start
```

If this is a fresh auth store, the brain logs a one-shot `/setup` URL. Open it locally and register a passkey before connecting OAuth-capable clients.

The local MCP URL is:

```text
http://localhost:8080/mcp
```

### 2. Start MCP Inspector

For local development, run the Inspector UI without its own UI auth. This does **not** disable the brain's MCP OAuth checks.

```bash
DANGEROUSLY_OMIT_AUTH=true npx @modelcontextprotocol/inspector
```

Open the Inspector UI it prints, usually:

```text
http://localhost:6274
```

### 3. Connect to the brain

In Inspector:

- **Transport**: Streamable HTTP
- **Server URL**: `http://localhost:8080/mcp`
- **Authentication**: use the OAuth flow when offered by Inspector

The brain advertises OAuth metadata, dynamically registers the client, opens a browser/passkey authorization flow, and issues an access token with the `mcp` scope.

Once connected, you can list tools/resources and run safe tool calls such as `system_status`.

## Deprecated static-token fallback

Only use this for clients or Inspector versions that cannot complete OAuth.

1. Configure a fallback token:

   ```yaml
   plugins:
     mcp:
       authToken: ${MCP_AUTH_TOKEN}
   ```

2. Set it in `.env`:

   ```bash
   MCP_AUTH_TOKEN=test-token-12345678901234567890123456789012
   ```

3. In Inspector, set:
   - **Header Name**: `Authorization`
   - **Bearer Token**: `test-token-12345678901234567890123456789012`

Inspector sends:

```text
Authorization: Bearer test-token-12345678901234567890123456789012
```

## Production setup

For production servers:

- **Server URL**: `https://yourdomain.com/mcp`
- **Transport**: Streamable HTTP
- **Authentication**: OAuth/passkey flow preferred

Always use HTTPS in production. Preserve the deployment volume that backs `/app/data/auth`; losing it invalidates passkeys, sessions, OAuth clients, signing keys, authorization codes, and refresh tokens.

## Troubleshooting

### Connection refused

- Check the server is running: `curl http://localhost:8080/health`
- Verify port 8080 is not blocked

### OAuth loop or authorization failed

- Confirm you registered the first operator passkey from the `/setup` URL
- Clear the Inspector/client's cached MCP OAuth state and retry
- Verify the server URL exactly matches the endpoint you are connecting to, including scheme/host/port

### Authentication failed in static-token mode

- Verify the token matches exactly what's in `.env`
- Check the Authorization header format: `Bearer <token>`
- Ensure there are no extra spaces before/after the token

### CORS issues

- The server includes CORS headers by default
- If using a custom domain, ensure it's properly configured

## Security notes

- Prefer OAuth/passkeys over `MCP_AUTH_TOKEN`
- Never share production tokens if you use the deprecated static fallback
- Rotate fallback tokens regularly
- Keep auth state outside `brain-data`
