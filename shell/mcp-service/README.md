# @brains/mcp-service

Model Context Protocol (MCP) server and registration service for Brain applications.

## Overview

This package owns the core MCP service used by interfaces and plugins. It keeps package-local registries for tools, resources, resource templates, prompts, and plugin instructions, then exposes those registrations through MCP SDK server instances.

## Features

- MCP server creation and management
- Tool, resource, resource-template, and prompt registration
- Permission-based tool exposure
- Fresh server creation for session-oriented transports
- Transport-agnostic service interface
- Direct registration pattern; no registration events

## Architecture

The MCP service works with transport implementations without owning transport logic:

- **`shell/mcp-service`**: core MCP server creation and registration
- **`interfaces/mcp`**: transport protocols such as stdio and HTTP

Plugins register capabilities directly with `IMCPService`. Transports use `IMCPTransport` to obtain MCP server instances and set transport permission levels.

## Usage

```typescript
import { MCPService, type Tool } from "@brains/mcp-service";
import { z } from "@brains/utils";

const mcpService = MCPService.getInstance(messageBus, logger);

const tool: Tool = {
  name: "example_echo",
  description: "Echo input text",
  inputSchema: {
    text: z.string(),
  },
  visibility: "public",
  handler: async () => ({ success: true, data: "ok" }),
};

mcpService.registerTool("example", tool);
```

### Register a resource

```typescript
mcpService.registerResource("system", {
  uri: "entity://types",
  name: "Entity Types",
  description: "List supported entity types",
  mimeType: "text/plain",
  handler: async () => ({
    contents: [
      {
        uri: "entity://types",
        mimeType: "text/plain",
        text: "post\nnote",
      },
    ],
  }),
});
```

### Register a resource template

```typescript
mcpService.registerResourceTemplate("system", {
  name: "entity-detail",
  uriTemplate: "entity://{type}/{id}",
  description: "Read an entity by type and ID",
  handler: async ({ type, id }) => ({
    contents: [
      {
        uri: `entity://${type}/${id}`,
        mimeType: "text/markdown",
        text: `# ${id}`,
      },
    ],
  }),
});
```

### Register a prompt

```typescript
mcpService.registerPrompt("system", {
  name: "create",
  description: "Create new content",
  args: {
    type: { description: "Entity type", required: true },
    topic: { description: "Topic" },
  },
  handler: async ({ type, topic }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Create a ${type} about ${topic ?? "anything"}`,
        },
      },
    ],
  }),
});
```

## Permission levels

Tool visibility uses `UserPermissionLevel` from `@brains/templates`:

- `public`: remotely safe access
- `trusted`: authenticated or trusted-user access
- `anchor`: full local/owner access

Tools default to `anchor` visibility when omitted.

```typescript
mcpService.setPermissionLevel("public");
```

The internal registry always stores all tools. Permission checks only control what is exposed through MCP protocol servers or returned from permission-filtered listings.

```typescript
const publicTools = mcpService.listToolsForPermissionLevel("public");
const anchorTools = mcpService.listToolsForPermissionLevel("anchor");
```

## MCP servers

Transport layers can reuse the service-owned server or request a fresh server populated from the current registries.

```typescript
const sharedServer = mcpService.getMcpServer();
const sessionServer = mcpService.createMcpServer("public");
```

Fresh servers are useful for transports where each client/session needs its own MCP server instance.

## Interfaces

Transport-facing interface:

```typescript
interface IMCPTransport {
  getMcpServer(): McpServer;
  createMcpServer(permissionLevel?: UserPermissionLevel): McpServer;
  setPermissionLevel(level: UserPermissionLevel): void;
}
```

Full service interface extends transport access with registration and listing methods:

```typescript
interface IMCPService extends IMCPTransport {
  registerTool(pluginId: string, tool: Tool): void;
  registerResource(pluginId: string, resource: Resource): void;
  registerResourceTemplate(pluginId: string, template: ResourceTemplate): void;
  registerPrompt(pluginId: string, prompt: Prompt): void;
  listTools(): Array<{ pluginId: string; tool: Tool }>;
  getCliTools(): Array<{ pluginId: string; tool: Tool }>;
  listToolsForPermissionLevel(level: UserPermissionLevel): Array<{
    pluginId: string;
    tool: Tool;
  }>;
  listResources(): Array<{ pluginId: string; resource: Resource }>;
  registerInstructions(pluginId: string, instructions: string): void;
  getInstructions(): string[];
}
```

## Testing

Use `createFresh` for isolated test instances:

```typescript
import { MCPService } from "@brains/mcp-service";

const service = MCPService.createFresh(mockMessageBus, mockLogger);
service.registerTool("test-plugin", mockTool);

expect(service.listTools()).toEqual([
  { pluginId: "test-plugin", tool: mockTool },
]);
```

## Exports

- `MCPService`
- `IMCPService`, `IMCPTransport`, `ToolInfo`
- `Tool`, `Resource`, `ResourceTemplate`, `Prompt`
- `ToolVisibility`, `ToolContext`, `ToolResponse`, `ResourceVars`
- Tool response schemas and helpers
- `createTool`, `createResource`, `toolSuccess`, `toolError`
- `mapArgsToInput`

## License

Apache-2.0
