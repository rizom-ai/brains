# MCP Server Deployment Guide

## Overview

The Model Context Protocol (MCP) server is exposed as part of the Personal Brain deployment, allowing external tools and clients to interact with your brain through a standardized API.

## Deployment Configuration

### Port Configuration

The MCP server runs on port **3333** by default. This port is:

- Exposed in Docker containers
- Opened in Hetzner firewall rules
- Proxied through Caddy for SSL when using domain-based deployment

### Authentication

MCP HTTP API supports Bearer token authentication for production deployments:

1. **Generate a secure token** (minimum 32 characters recommended):

   ```bash
   openssl rand -hex 32
   ```

2. **Set the token in your environment file**:

   ```bash
   # .env.production
   MCP_AUTH_TOKEN=your-secure-token-here
   ```

3. **Authentication is automatically enabled** when `MCP_AUTH_TOKEN` is set

### Access URLs

#### With Domain (HTTPS via Caddy)

- API (MCP): `https://api.yourdomain.com/mcp`
- Production site: `https://yourdomain.com`
- Preview site: `https://preview.yourdomain.com`

#### Without Domain (Direct Port Access)

- API (MCP): `http://server-ip:3333/mcp`
- Production site: `http://server-ip:8080`
- Preview site: `http://server-ip:4321`

## Client Configuration

### Using MCP Inspector

To connect MCP Inspector to your deployed server:

1. Open MCP Inspector in your browser
2. Enter the server URL:
   - With domain: `https://api.yourdomain.com/mcp`
   - Without domain: `http://server-ip:3333/mcp`
3. If authentication is enabled, add the Bearer token in the headers:
   ```
   Authorization: Bearer your-secure-token-here
   ```

### Using Claude Desktop

To configure Claude Desktop to use your deployed MCP server:

1. Edit your Claude Desktop configuration file:
   ```json
   {
     "mcpServers": {
       "personal-brain": {
         "transport": "http",
         "url": "https://api.yourdomain.com/mcp",
         "headers": {
           "Authorization": "Bearer your-secure-token-here"
         }
       }
     }
   }
   ```

### Using Custom Clients

When building custom MCP clients, include the Bearer token in all requests:

```javascript
const response = await fetch("https://api.yourdomain.com/mcp", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer your-secure-token-here",
    "MCP-Session-Id": sessionId, // for existing sessions
  },
  body: JSON.stringify(mcpRequest),
});
```

## Security Considerations

1. **Always use authentication in production**: Set `MCP_AUTH_TOKEN` in your production environment
2. **Use HTTPS when possible**: Deploy with a domain to enable SSL through Caddy
3. **Keep tokens secure**: Never commit tokens to version control
4. **Rotate tokens regularly**: Update `MCP_AUTH_TOKEN` periodically
5. **Monitor access**: Review server logs for unauthorized access attempts

## Deployment Steps

### 1. Prepare Environment File

Create or update your `.env.production` file:

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-api03-YOUR-KEY-HERE

# MCP Authentication
MCP_AUTH_TOKEN=your-secure-token-here-minimum-32-chars

# Optional: Domain for SSL
DOMAIN=brain.example.com
```

### 2. Deploy with Hetzner

```bash
cd deploy/providers/hetzner
./deploy.sh test-brain
```

### 3. Verify Deployment

Check that MCP is accessible:

```bash
# Test health endpoint (no auth required)
curl https://api.yourdomain.com/health

# Test API endpoint (requires auth)
curl -X POST https://api.yourdomain.com/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-token-here" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "params": {}, "id": 1}'
```

## Troubleshooting

### Connection Refused

- Verify port 3333 is open in firewall
- Check Docker container is running: `docker ps`
- Review logs: `docker logs personal-brain`

### Authentication Errors

- Verify `MCP_AUTH_TOKEN` is set in environment
- Check token is included in Authorization header
- Ensure token matches exactly (no extra spaces)

### CORS Issues

- Caddy configuration includes CORS headers for API endpoint
- For local development, CORS is automatically handled

## Migration from Development

When moving from development to production:

1. Generate a secure token for production
2. Update your client configurations with the production URL and token
3. Test connectivity before switching over completely
4. Update any automation scripts or CI/CD pipelines
