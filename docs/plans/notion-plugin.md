# Plan: Notion Plugin + MCP Bridge Base Class

## Context

Rover needs read-only access to a user's Notion workspace. The official `@notionhq/notion-mcp-server` already handles the Notion API, token optimization for LLMs, and markdown conversion. Rather than reimplementing all of that, we spawn it as a child process and connect via MCP SDK.

This pattern — spawn an MCP server, connect via stdio, expose a filtered subset of its tools — will repeat for GitHub, Slack, Linear, etc. So we extract a reusable `MCPBridgePlugin` base class that any future integration can extend with minimal code.

## Architecture

```
MCPBridgePlugin (base class)
  ↓ extends
NotionPlugin
  ↓ spawns
@notionhq/notion-mcp-server (child process, stdio)
  ↓ MCP SDK Client
Tool discovery → filter → adapt → register as PluginTool[]
```

## MCPBridgePlugin Base Class

Reusable base for any plugin that wraps an external MCP server:

```typescript
abstract class MCPBridgePlugin<TConfig> extends CorePlugin<TConfig> {
  private client: Client;
  private transport: StdioClientTransport;

  // Subclass defines how to spawn the server
  protected abstract getServerCommand(): { command: string; args: string[]; env?: Record<string, string> };

  // Subclass defines which tools to expose (allowlist)
  protected abstract getAllowedTools(): string[];

  // Subclass provides instructions for the agent
  protected abstract getAgentInstructions(): string;

  // Base handles: spawn, connect, discover, filter, adapt, register
  protected override async onRegister(context): Promise<void> { ... }
  protected override async getTools(): Promise<PluginTool[]> { ... }
  protected override async getInstructions(): Promise<string> { ... }
  async shutdown(): Promise<void> { ... }
}
```

The base class handles all MCP client lifecycle (spawn, handshake, tool discovery, adaptation, error isolation, shutdown). Subclasses only define three things: what to spawn, which tools to expose, and what to tell the agent.

### Tool Adaptation

Remote tools are automatically prefixed and wrapped:

```typescript
// Remote tool "search" from NotionPlugin (id: "notion")
// → registered as "notion_search" with error isolation
{
  name: "notion_search",
  description: "[Notion] Search for pages in the user's Notion workspace",
  handler: async (input) => {
    try {
      return { success: true, data: await client.callTool("search", input) };
    } catch (error) {
      return { success: false, error: `Notion: ${error.message}` };
    }
  }
}
```

### Error Isolation

If the child process crashes, tools return errors — the brain doesn't crash. The base class monitors the process and logs warnings. No auto-restart in v1.

## NotionPlugin

```typescript
class NotionPlugin extends MCPBridgePlugin<NotionConfig> {
  protected getServerCommand() {
    return {
      command: "npx",
      args: ["-y", "@notionhq/notion-mcp-server"],
      env: {
        OPENAPI_MCP_HEADERS: JSON.stringify({
          Authorization: `Bearer ${this.config.token}`,
          "Notion-Version": "2022-06-28",
        }),
      },
    };
  }

  protected getAllowedTools() {
    return [
      "search",
      "read_page",
      "retrieve_block_children",
      "list_databases",
      "query_database",
    ];
  }

  protected getAgentInstructions() {
    return `Use notion_* tools to look up information in the user's Notion workspace.
Use the brain's own tools (search_entities, create_note, etc.) for the brain's
knowledge base. Never write to Notion — only read tools are available.`;
  }
}
```

### Config

```yaml
plugins:
  notion:
    token: ${NOTION_TOKEN}
```

That's the entire user-facing config.

## Future integrations

Same pattern, minimal code per integration:

```typescript
// GitHub plugin — ~20 lines
class GitHubPlugin extends MCPBridgePlugin<GitHubConfig> {
  protected getServerCommand() {
    return {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: this.config.token },
    };
  }

  protected getAllowedTools() {
    return [
      "search_repositories",
      "get_file_contents",
      "list_issues",
      "get_issue",
    ];
  }

  protected getAgentInstructions() {
    return "Use github_* tools to look up code and issues in the user's GitHub repositories.";
  }
}
```

Each new integration is a single file — server command, tool allowlist, instructions.

## Implementation

### Package Architecture

The MCP bridge lives in its own shared package (`@brains/mcp-bridge`) to keep the
MCP SDK dependency isolated. Without this, adding it to `@brains/plugins` would pull
`@modelcontextprotocol/sdk` into every plugin in the monorepo.

```
shared/          ←  shell/          ←  plugins/
@brains/utils        @brains/plugins      @brains/system
@brains/mcp-bridge                        @brains/notion
```

Dependency graph:

```
@brains/mcp-bridge
  depends on: @brains/plugins, @modelcontextprotocol/sdk

@brains/notion (and future bridge plugins)
  depends on: @brains/plugins, @brains/mcp-bridge
```

### Files

```
shared/mcp-bridge/
  package.json                # @brains/mcp-bridge — depends on @brains/plugins + @modelcontextprotocol/sdk
  tsconfig.json
  src/
    index.ts                  # Public exports
    mcp-bridge-plugin.ts      # MCPBridgePlugin base class (spawn, connect, filter, adapt)
  test/
    mcp-bridge-plugin.test.ts # Tests with mock transport (no real child process)

plugins/notion/
  package.json                # @brains/notion — depends on @brains/plugins + @brains/mcp-bridge
  tsconfig.json
  src/
    index.ts                  # Plugin export
    plugin.ts                 # NotionPlugin extends MCPBridgePlugin
    config.ts                 # Zod schema (just token)
  test/
    plugin.test.ts            # Tests with mock transport
```

### Dependencies

- `@modelcontextprotocol/sdk` — already in monorepo root, added as dependency only to `@brains/mcp-bridge`
- `@brains/plugins` — imported by `@brains/mcp-bridge` for the `CorePlugin` base class
- No new external dependencies

## Steps

### Phase 1: `@brains/mcp-bridge` shared package

1. Create `shared/mcp-bridge/` package with `@brains/mcp-bridge` name
2. Base class in `shared/mcp-bridge/src/mcp-bridge-plugin.ts`
3. Spawn child process via StdioClientTransport
4. Connect via MCP SDK Client
5. Discover tools, filter by allowlist, adapt with prefix + error isolation
6. Tests with mock transport (no real child process)

### Phase 2: Notion plugin

1. Create `plugins/notion/` package with `@brains/mcp-bridge` dependency
2. NotionPlugin extends MCPBridgePlugin (imported from `@brains/mcp-bridge`)
3. Config schema (just token)
4. Tool allowlist (read-only tools)
5. Agent instructions
6. Register in rover brain definition (optional, not in any preset)
7. Manual test: ask rover about Notion content

### Phase 3: Validate pattern with second integration

1. Pick GitHub or Linear
2. Implement as MCPBridgePlugin subclass (~20 lines) using `@brains/mcp-bridge`
3. Verify the base class works for a different server

## Verification

1. `bun test shared/mcp-bridge/`
2. `bun test plugins/notion/`
3. `bun run typecheck --filter=@brains/mcp-bridge`
4. `bun run typecheck --filter=@brains/notion`
5. Manual: configure NOTION_TOKEN, ask rover "search my Notion for meeting notes"
6. Verify: only read tools appear in MCP Inspector, no write tools
7. Kill the Notion MCP server process, verify tools return errors (not crash)
