# Test Brain App

A minimal application for testing the Personal Brain shell architecture.

## Usage

### Normal Mode (Interactive Testing)

Run the app normally to test shell initialization and basic query functionality:

```bash
bun run dev
```

This will:
- Initialize the shell with a local SQLite database
- Run database migrations
- Execute a test query
- Shut down cleanly

### Server Mode (MCP Server)

Run as an MCP server to expose the brain functionality via the Model Context Protocol:

```bash
bun run server
```

Or directly:

```bash
bun run src/index.ts --server
```

This starts an MCP server that can be used with any MCP-compatible client (like Claude Desktop).

## MCP Client Configuration

To use with Claude Desktop, add this to your Claude configuration:

```json
{
  "mcpServers": {
    "test-brain": {
      "command": "bun",
      "args": ["run", "/path/to/brains/apps/test-brain/src/index.ts", "--server"]
    }
  }
}
```

## Environment Variables

- `DATABASE_URL`: SQLite database location (default: `file:./test-brain.db`)
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