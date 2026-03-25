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

### Files

```
shared/plugins/src/bridge/
  mcp-bridge-plugin.ts       # Base class (spawn, connect, filter, adapt)

plugins/notion/
  package.json
  src/
    index.ts                  # Plugin export
    plugin.ts                 # NotionPlugin extends MCPBridgePlugin
    config.ts                 # Zod schema (just token)
  test/
    plugin.test.ts            # Tests with mock transport
```

### Dependencies

- `@modelcontextprotocol/sdk` — already in monorepo (Client, StdioClientTransport)
- No new dependencies

## Steps

### Phase 1: MCPBridgePlugin base class

1. Base class in `shared/plugins/src/bridge/mcp-bridge-plugin.ts`
2. Spawn child process via StdioClientTransport
3. Connect via MCP SDK Client
4. Discover tools, filter by allowlist, adapt with prefix + error isolation
5. Tests with mock transport (no real child process)

### Phase 2: Notion plugin

1. NotionPlugin extends MCPBridgePlugin
2. Config schema (just token)
3. Tool allowlist (read-only tools)
4. Agent instructions
5. Register in rover brain definition (optional, not in any preset)
6. Manual test: ask rover about Notion content

### Phase 3: Validate pattern with second integration

1. Pick GitHub or Linear
2. Implement as MCPBridgePlugin subclass (~20 lines)
3. Verify the base class works for a different server

## Verification

1. `bun test plugins/notion/`
2. `bun run typecheck --filter=@brains/notion`
3. Manual: configure NOTION_TOKEN, ask rover "search my Notion for meeting notes"
4. Verify: only read tools appear in MCP Inspector, no write tools
5. Kill the Notion MCP server process, verify tools return errors (not crash)
