# @brains/mcp-service

Model Context Protocol (MCP) server implementation for Personal Brain applications.

## Overview

This service provides the core MCP server functionality, handling tool and resource registration from plugins and managing permission levels for different transport types.

## Features

- MCP server creation and management
- Tool and resource registration
- Permission-based access control
- Transport-agnostic design
- Direct registration pattern (no events)

## Architecture

The MCP service works in conjunction with transport implementations:

- **mcp-service**: Core MCP server and registration (this package)
- **interfaces/mcp**: Transport protocols (stdio, HTTP)

## Usage

```typescript
import { MCPService } from "@brains/mcp-service";

// Initialize service
const mcpService = MCPService.getInstance({
  messageBus,
  logger,
});

// Register a tool
mcpService.registerTool({
  name: "my-tool",
  description: "Does something useful",
  inputSchema: mySchema,
  handler: async (input) => {
    // Tool implementation
  }
});

// Register a resource
mcpService.registerResource({
  uri: "entity://types",
  name: "Entity Types",
  description: "List of supported entity types",
  handler: async (uri) => {
    // Resource implementation
  }
});

// Set permission level for transport
mcpService.setPermissionLevel("anchor"); // or "public"

// Get MCP server instance for transport
const mcpServer = mcpService.getMcpServer();
```

## Permission Levels

Control access based on transport type:

- **anchor**: Full access (trusted local process, e.g., stdio)
- **public**: Limited access (remote connections, e.g., HTTP)

```typescript
type UserPermissionLevel = "public" | "anchor";

// Set based on transport
mcpService.setPermissionLevel(
  transport === "stdio" ? "anchor" : "public"
);
```

## Direct Registration

The service uses direct registration to avoid timing issues:

```typescript
// Plugins register directly with the service
class MyPlugin extends CorePlugin {
  async onRegister(context: CorePluginContext) {
    // Direct registration - no events
    const tool = await this.getTools();
    context.mcpTransport.registerTool(tool);
  }
}
```

## MCP Server

The underlying MCP server from the SDK:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Created internally by MCPService
const mcpServer = new McpServer({
  name: "personal-brain",
  version: "1.0.0",
});

// Available via
const server = mcpService.getMcpServer();
```

## Transport Interface

Transports connect to the MCP service:

```typescript
interface IMCPTransport {
  registerTool(tool: PluginTool): void;
  registerResource(resource: PluginResource): void;
  setPermissionLevel(level: UserPermissionLevel): void;
  getMcpServer(): McpServer;
}
```

## Integration with Transports

Transport layers (stdio, HTTP) get the MCP server instance:

```typescript
// In transport implementation
const mcpServer = mcpService.getMcpServer();
transport.connectMCPServer(mcpServer);
```

## Testing

```typescript
import { MCPService } from "@brains/mcp-service";

// Create test instance
const service = MCPService.createFresh({
  messageBus: mockBus,
  logger: mockLogger,
});

// Test tool registration
service.registerTool(mockTool);
expect(service.getTools()).toContain(mockTool);
```

## Configuration

```typescript
interface MCPServiceConfig {
  messageBus: MessageBus;
  logger: Logger;
}
```

## Exports

- `MCPService` - Main service class
- `IMCPTransport` - Transport interface
- `UserPermissionLevel` - Permission type
- `getPermissionHandler` - Permission utilities

## License

MIT