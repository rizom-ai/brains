# Plan: MCP Resources & Prompts

## Context

The brain exposes all functionality as MCP tools, but tools are the only MCP primitive we use. Resources and prompts are spec features that MCP clients (Claude Desktop, Cursor, VS Code) actively support and surface in their UIs.

**Current state:**

- Tools: 20+ registered, permission-controlled, fully integrated
- Resources: only `entity://types` (static list in MCP interface — wrong place)
- Prompts: none
- Sampling: not supported by Claude Desktop yet — deferred

**Why this matters:**

- Resources make the brain **browsable** — clients can list and read content without tool calls
- Prompts make the brain **accessible** — users discover workflows in the client's prompt picker instead of typing from scratch
- Both reduce friction for non-technical users and MCP clients that surface these in their UI

## Phase 1: Resources

### Resource ownership

Resources are registered by the plugin that owns the data, not by the MCP transport:

| URI pattern            | Owner         | Description                 | Returns                                         |
| ---------------------- | ------------- | --------------------------- | ----------------------------------------------- |
| `brain://identity`     | system plugin | Brain character             | JSON: name, role, purpose, values               |
| `brain://profile`      | system plugin | Anchor profile              | JSON: name, bio, expertise                      |
| `entity://types`       | system plugin | All registered entity types | Text: newline-separated type names              |
| `entity://{type}`      | system plugin | List entities of a type     | JSON: array of `{ id, title, status, updated }` |
| `entity://{type}/{id}` | system plugin | Read a single entity        | Markdown: full entity content with frontmatter  |
| `brain://site`         | site-builder  | Site metadata               | JSON: title, description, domain, URLs          |

### URI templates

The MCP SDK supports `resource()` with a `ResourceTemplate` for parameterized URIs. The `{type}` and `{id}` segments are resolved at read time:

```typescript
server.resource(
  "entity",
  new ResourceTemplate("entity://{type}/{id}", { list: undefined }),
  async (uri, { type, id }) => {
    const entity = await entityService.getEntity(type, id);
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: entity.content,
        },
      ],
    };
  },
);
```

### Permission model

Resources inherit the same permission model as tools:

- `brain://identity` — public (this is what the brain shares with everyone)
- `brain://profile` — public
- `entity://types` — public
- `entity://{type}` — trusted (list entities)
- `entity://{type}/{id}` — trusted (read entity content)
- `brain://site` — public

Published content could be public; draft content requires trusted. For simplicity, start with trusted for all entity reads.

### Steps

1. Move `entity://types` from MCP interface to system plugin
2. Add `brain://identity` and `brain://profile` resources to system plugin
3. Add `registerResourceTemplate()` to MCPService (wraps SDK method)
4. Register `entity://{type}` resource template in system plugin — lists entities with metadata
5. Register `entity://{type}/{id}` resource template in system plugin — returns full markdown content
6. Add `brain://site` resource to site-builder plugin
7. Tests for all resources

## Phase 2: Prompts for Common Workflows

### What we expose

| Prompt name  | Arguments                             | Owner         | Description                                               |
| ------------ | ------------------------------------- | ------------- | --------------------------------------------------------- |
| `create`     | `type` (required), `topic` (optional) | system plugin | Create new content — routes to system_create              |
| `generate`   | `type` (required), `topic` (required) | system plugin | AI-generate content — routes to system_create with prompt |
| `review`     | `type` (required), `id` (required)    | system plugin | Load entity and ask for feedback/improvements             |
| `publish`    | `type` (required), `id` (required)    | system plugin | Guided publishing — preview, confirm, publish             |
| `brainstorm` | `topic` (required)                    | system plugin | Ideation session with brain context and expertise         |

### How prompts work in MCP

Prompts are parameterized message templates that clients discover via `prompts/list` and invoke via `prompts/get`. The server returns a list of messages (system + user) that the client uses to start a conversation.

```typescript
server.prompt(
  "create",
  "Create new content",
  {
    type: z.string().describe("Entity type (post, deck, note, link, etc.)"),
    topic: z.string().optional().describe("Topic or title"),
  },
  async ({ type, topic }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: topic
            ? `Create a new ${type} about: ${topic}`
            : `Create a new ${type}. Ask me what it should be about.`,
        },
      },
    ],
  }),
);
```

### Plugin-contributed prompts (future)

Plugins can register prompts for their domain-specific workflows:

| Plugin       | Prompt               | Arguments             | Description                            |
| ------------ | -------------------- | --------------------- | -------------------------------------- |
| blog         | `write-essay`        | `topic`, `series?`    | Blog post with optional series context |
| social-media | `share`              | `topic?`, `platform?` | Social post with platform guidance     |
| newsletter   | `compose-newsletter` | `theme?`              | Newsletter from recent content         |
| site-builder | `build-site`         | `environment?`        | Build and preview the site             |

These are optional enhancements — the generic `create` and `generate` prompts cover most cases.

### Steps

1. Add `registerPrompt()` to MCPService (wraps SDK method)
2. Add prompt registration to plugin context
3. Register generic prompts in system plugin: create, generate, review, publish, brainstorm
4. Tests

## Phase 3: Sampling (Future)

Deferred until Claude Desktop supports it. When available, sampling enables:

- **Hosted rovers without API keys** — use the client's LLM for generation
- **Model-agnostic generation** — client picks the model
- **Human-in-the-loop** — client reviews prompts before execution

No implementation work needed now.

## Key files

| File                                   | Change                                                    |
| -------------------------------------- | --------------------------------------------------------- |
| `shell/mcp-service/src/mcp-service.ts` | Add `registerResourceTemplate()`, `registerPrompt()`      |
| `shell/mcp-service/src/types.ts`       | Add `PluginResourceTemplate`, `PluginPrompt` interfaces   |
| `interfaces/mcp/src/mcp-interface.ts`  | Remove `entity://types` resource (moves to system plugin) |
| `plugins/system/src/plugin.ts`         | Register resources + prompts                              |
| `plugins/site-builder/src/plugin.ts`   | Register `brain://site` resource                          |
| `shell/plugins/src/service/context.ts` | Expose prompt registration on plugin context              |

## Verification

1. `bun run typecheck` / `bun test` / `bun run lint`
2. MCP Inspector: `resources/list` returns brain + entity resources
3. MCP Inspector: `resources/read` with `entity://post/my-post-id` returns markdown
4. MCP Inspector: `prompts/list` returns all registered prompts
5. MCP Inspector: `prompts/get` with `create { type: "post" }` returns correct messages
6. Claude Desktop: resources visible in resource browser
7. Claude Desktop: prompts visible in prompt picker
8. Permission enforcement: public user can read profile, not entity content
