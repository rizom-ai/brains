# Recall for Teams

Collaborative knowledge management powered by AI.

## Development

### Running in Development

```bash
# Run in development mode (interactive testing)
bun run dev

# Run as MCP server in development
bun run server
```

This will:

- Initialize the shell with a local SQLite database
- Configure plugins (git-sync)
- Execute a test query (in normal mode)
- Start MCP server (in server mode)

## Building

The app can be compiled to a standalone binary using Bun:

```bash
# Build the binary
bun run build

# Build optimized production binary
bun run build:prod

# Clean build artifacts
bun run clean
```

The binary will be created at `dist/team-brain`.

## Running the Binary

```bash
# Run the compiled binary
bun run start

# Run as MCP server
bun run start:server

# Or directly
./dist/team-brain
./dist/team-brain --server
```

## Testing with MCP Inspector

1. Build the binary: `bun run build`
2. Run the MCP inspector: `npx @modelcontextprotocol/inspector --config mcp-config.json --server team-brain`
3. Open the inspector URL in your browser

## MCP Client Configuration

To use with Claude Desktop or other MCP clients:

```json
{
  "mcpServers": {
    "team-brain": {
      "command": "./dist/team-brain",
      "args": ["--server"]
    }
  }
}
```

## Environment Variables

- `DATABASE_URL`: SQLite database location (default: `file:./team-brain.db`)
- `ANTHROPIC_API_KEY`: API key for AI queries (default: `test-key`)
- `LOG_LEVEL`: Logging level (default: `info`)

## Available MCP Tools

When running in server mode, the following tools are exposed:

- `brain_query`: Execute natural language queries
- `brain_command`: Execute shell commands
- `entity_create`: Create new entities
- `entity_search`: Search for entities
- `entity_get`: Get entity by ID
- `entity_update`: Update existing entity
- `entity_delete`: Delete entity

## Available MCP Resources

- `entity://list`: List all entities
- `entity://{id}`: Get specific entity by ID
- `schema://list`: List all registered schemas
