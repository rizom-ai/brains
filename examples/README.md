# Brain MCP Server Examples

This directory contains examples demonstrating how to use the Brain system with MCP (Model Context Protocol).

## Files

- `brain-mcp-server.ts` - A complete MCP server that exposes Brain functionality
- `test-mcp-client.ts` - A test client that connects to the server and tests various endpoints
- `test-mcp.sh` - Interactive testing script using the MCP inspector

## Prerequisites

1. Install dependencies:
```bash
bun install
```

2. Build the packages:
```bash
bun run build
```

3. (Optional) Install MCP inspector for interactive testing:
```bash
npm install -g @modelcontextprotocol/inspector
```

## Running the Examples

### Basic Server

Run the Brain MCP server:
```bash
bun run examples/brain-mcp-server.ts
```

The server will start and listen on stdio for MCP commands.

### Automated Testing

In one terminal, run the server:
```bash
bun run examples/brain-mcp-server.ts
```

In another terminal, run the test client:
```bash
bun run examples/test-mcp-client.ts
```

### Interactive Testing

Use the MCP inspector for interactive testing:
```bash
./examples/test-mcp.sh
```

This will open an interactive interface where you can:
- Browse available tools and resources
- Execute tools with custom parameters
- Read resources
- See real-time responses

## Available Tools

The Brain MCP server exposes these tools:

1. **brain_query** - Process natural language queries
   - Parameters: `query` (string), `options` (object)
   
2. **brain_command** - Execute Brain commands
   - Parameters: `command` (string), `args` (array), `context` (object)

3. **entity_search** - Search for entities
   - Parameters: `entityType` (string), `query` (string), `limit` (number)

4. **entity_get** - Get a specific entity
   - Parameters: `entityType` (string), `entityId` (string)

5. **brain_status** - Get system status
   - No parameters required

## Available Resources

- `brain://health` - Health check endpoint
- `brain://entities` - List all entities
- `brain://schemas` - List all registered schemas
- `brain://entity_{type}/{id}` - Access specific entities
- `brain://schema_{name}` - Access specific schemas

## Example Usage

### Query Processing
```json
{
  "tool": "brain_query",
  "arguments": {
    "query": "What are the key features of the Brain system?",
    "options": {
      "limit": 10,
      "includeMetadata": true
    }
  }
}
```

### Command Execution
```json
{
  "tool": "brain_command",
  "arguments": {
    "command": "help",
    "args": [],
    "context": {}
  }
}
```

### Entity Search
```json
{
  "tool": "entity_search",
  "arguments": {
    "entityType": "note",
    "query": "typescript",
    "limit": 5
  }
}
```

## Troubleshooting

1. **Server won't start**: Make sure the database file has proper permissions
2. **Client can't connect**: Ensure the server is running before starting the client
3. **Tools not available**: Check that all packages are built (`bun run build`)

## Development

To modify the server behavior:
1. Edit `brain-mcp-server.ts`
2. Add new tools or resources as needed
3. Restart the server to see changes

The server demonstrates best practices for:
- Initializing Brain components
- Registering MCP tools and resources
- Handling requests and responses
- Error handling and logging