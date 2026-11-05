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
- `admin`: full administrative access

Tools default to `admin` visibility when omitted.

```typescript
mcpService.setPermissionLevel("public");
```

The internal registry always stores all tools. Permission checks only control what is exposed through MCP protocol servers or returned from permission-filtered listings.

```typescript
const publicTools = mcpService.listToolsForPermissionLevel("public");
const adminTools = mcpService.listToolsForPermissionLevel("admin");
```

## Agent, protocol, and CLI exposure

One registry feeds three independently enumerable surfaces. Permission and exposure are separate checks: a tool reaches a surface only when the caller's level meets its `visibility` and the tool's exposure allows that surface.

| Surface                   | Tool field                                              | Listing                                            |
| ------------------------- | ------------------------------------------------------- | -------------------------------------------------- |
| Model tools during a turn | `agentTool` (default `true`)                            | `listAgentToolsForPermissionLevel(level)`          |
| Direct MCP clients        | `directMcpExposure`: `none`, `basic`, `debug` (default) | `listProtocolToolsForPermissionLevel(level, mode)` |
| Brain CLI commands        | `cli: { name }`                                         | `getCliTools()`                                    |
| Everything, unfiltered    | —                                                       | `listTools()`                                      |

- Basic MCP exposes only tools that opt in with `directMcpExposure: "basic"`; in the canonical brain that is `chat` and `confirm`. Debug MCP exposes every tool not marked `none`.
- `chat` and `confirm` are protocol adapters (`agentTool: false`), never recursive model tools.
- A tool may be agent-only, protocol-only, or both. `newsletter_signup` registers with neither, for the public signup form.
- Conditional tools change their exposure at registration time. `auth-service_get_passkey_setup_url` is agent-visible only until a passkey is registered; it then stays on Admin debug MCP. `newsletter_subscribers` registers only with a Buttondown provider, and `stock-photo_search`/`stock-photo_select` only with a stock-photo key.
- `directory_sync` takes its git variant, with `history`, only when git is configured. Variants are assembled after capability registration completes.

Rules for tool authors:

- Consolidated tools use a strict action discriminator with action-specific schemas, not a loose `{ action, args }` record. Action-level authorization and confirmation stay inside the union.
- Tools are adapters: business logic stays in the owning service.
- Confirmation fields (`confirmed`, `confirmationToken`, `contentHash`) are stripped from the model-visible schema; only an approved pending confirmation supplies them. Returned confirmation args are frozen. `publishing_manage` binds its token to the tool name, target entity, content hash, and a 15-minute expiry, so an edited entity or an expired token fails and needs a fresh confirmation.
- The agent service declines pending approvals when the caller sends any message other than an approval, so a superseded approval cannot be replayed later.
- A tool rename does not carry pending confirmations across it; they fail and request fresh approval.
- CLI commands and supported direct-MCP capabilities are never removed silently.
- Compact default results must not hide full diagnostic output from an explicitly authorized debug path.

Measure a composition's surfaces from `packages/brain-cli` with `bun run eval:professional -- --tool-surface` (add `--mcp-basic` for the protocol adapters, or use `bun run eval -- --suite providers --tool-surface` for the optional providers). The report lists the internal registry, agent tools and MCP basic/debug tools at each permission level, CLI tools, and the agent prompt size, counting instructions as `AgentService.instructionsFor(level, { isAnchor: false })`.

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

AGPL-3.0-only
