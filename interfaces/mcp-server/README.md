# @brains/mcp-server

Model Context Protocol (MCP) server implementation for Personal Brain.

## Overview

This package provides the infrastructure for running a standards-compliant MCP server. It does NOT define specific tools or resources - those are registered by the packages that implement the actual functionality.

The MCP server provides:

- **Server Infrastructure**: Core MCP server setup and lifecycle management
- **Transport Support**: stdio and HTTP/SSE transports
- **Registration API**: Allows other packages to register their tools and resources

## Features

- Full MCP compliance using `@modelcontextprotocol/sdk`
- Zero dependencies on other packages
- Multiple transport options (stdio, HTTP/SSE planned)
- Type-safe implementation with TypeScript
- Component Interface Standardization pattern

## Usage

```typescript
import { MCPServer } from "@brains/mcp-server";

// Create MCP server (just infrastructure)
const mcpServer = MCPServer.getInstance({
  name: "PersonalBrain",
  version: "1.0.0",
});

// Get the underlying server for registration
const server = mcpServer.getServer();

// Other packages register their tools
server.tool("my_tool", "Tool description", async (params) => {
  // Tool implementation
  return {
    content: [
      {
        type: "text",
        text: "Result",
      },
    ],
  };
});

// Other packages register their resources
server.resource(
  "my_resource",
  ":id",
  { description: "Resource description" },
  async (uri) => {
    // Resource implementation
    return {
      contents: [
        {
          uri: uri.toString(),
          text: "Content",
        },
      ],
    };
  },
);

// Start the server
await mcpServer.startStdio();
```

## Architecture

This package follows the Inversion of Control principle:

- The MCP server provides the infrastructure
- Other packages (shell, contexts) register their own tools and resources
- The MCP server has no knowledge of specific business logic

This ensures clean separation of concerns and makes the MCP server reusable for any application.

## Testing with MCP Inspector

To test the MCP server with the official MCP Inspector:

```bash
# Run the MCP server in stdio mode
bun run src/stdio.ts

# In another terminal, use MCP Inspector
npx @modelcontextprotocol/inspector
```

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Type checking
bun run typecheck

# Linting
bun run lint
```
