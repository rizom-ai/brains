# Plan: MCP Resources & Prompts

## Context

The brain exposes all functionality as MCP tools, but tools are the only MCP primitive we use. Resources and prompts are spec features that MCP clients (Claude Desktop, Cursor, VS Code) actively support and surface in their UIs.

**Current state:**

- Tools: 20+ registered, permission-controlled, fully integrated
- Resources: only `entity://types` (static list of entity type names)
- Prompts: none
- Sampling: not supported by Claude Desktop yet — deferred

**Why this matters:**

- Resources make the brain **browsable** — clients can list and read content without tool calls
- Prompts make the brain **accessible** — users discover workflows in the client's prompt picker instead of typing from scratch
- Both reduce friction for non-technical users and MCP clients that surface these in their UI

## Phase 1: Entity Resources with URI Templates

### What we expose

| URI pattern            | Description                          | Returns                                         |
| ---------------------- | ------------------------------------ | ----------------------------------------------- |
| `brain://profile`      | Brain identity + anchor profile      | JSON: name, tagline, bio, expertise             |
| `brain://site`         | Site info                            | JSON: title, description, navigation, URLs      |
| `entity://types`       | All registered entity types (exists) | Text: newline-separated type names              |
| `entity://{type}`      | List entities of a type              | JSON: array of `{ id, title, status, updated }` |
| `entity://{type}/{id}` | Read a single entity                 | Markdown: full entity content with frontmatter  |

### URI templates

The MCP SDK supports `registerResourceTemplate()` for parameterized URIs. The `{type}` and `{id}` segments are resolved at read time:

```typescript
server.resourceTemplate(
  "entity://{type}/{id}",
  "Read an entity by type and ID",
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

### Where resources are registered

Resources are a brain-level concern, not a plugin concern. The identity service owns `brain://` resources. The entity service owns `entity://` resources. Both register through `MCPService.registerResource()` / `registerResourceTemplate()`.

Registration happens in the MCP interface plugin during initialization, same as the existing `entity://types` resource.

### Permission model

Resources inherit the same permission model as tools:

- `brain://profile` — public (this is what the brain shares with everyone)
- `brain://site` — public
- `entity://types` — public
- `entity://{type}` — trusted (list entities)
- `entity://{type}/{id}` — trusted (read entity content)

Published content could be public; draft content requires trusted. For simplicity, start with trusted for all entity reads.

### Steps

1. Add `registerResourceTemplate()` to MCPService (wraps SDK method)
2. Register `brain://profile` and `brain://site` resources in MCP interface
3. Register `entity://{type}` resource template — lists entities with metadata
4. Register `entity://{type}/{id}` resource template — returns full markdown content
5. Add permission checking to resource reads
6. Tests

## Phase 2: Prompts for Common Workflows

### What we expose

| Prompt name  | Arguments                             | Description                                               |
| ------------ | ------------------------------------- | --------------------------------------------------------- |
| `create`     | `type` (required), `topic` (optional) | Create new content — routes to system_create              |
| `generate`   | `type` (required), `topic` (required) | AI-generate content — routes to system_create with prompt |
| `review`     | `type` (required), `id` (required)    | Load entity and ask for feedback/improvements             |
| `publish`    | `type` (required), `id` (required)    | Guided publishing — preview, confirm, publish             |
| `brainstorm` | `topic` (required)                    | Ideation session with brain context and expertise         |

### How prompts work in MCP

Prompts are parameterized message templates that clients discover via `prompts/list` and invoke via `prompts/get`. The server returns a list of messages (system + user) that the client uses to start a conversation.

```typescript
server.prompt(
  "create",
  "Create new content",
  {
    type: {
      description: "Entity type (post, deck, note, link, etc.)",
      required: true,
    },
    topic: { description: "Topic or title", required: false },
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

### Prompt registration

Prompts are registered by plugins through MCPService, similar to tools. The system plugin registers `create`, `generate`, `publish`. Brain-level prompts like `brainstorm` are registered by the MCP interface using the brain's identity context.

### Plugin-contributed prompts

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
2. Register generic prompts: create, generate, review, publish, brainstorm
3. Add plugin prompt registration to plugin context
4. Register plugin-specific prompts in blog, social-media, newsletter
5. Tests

## Phase 3: Sampling (Future)

Deferred until Claude Desktop supports it. When available, sampling enables:

- **Hosted rovers without API keys** — use the client's LLM for generation
- **Model-agnostic generation** — client picks the model
- **Human-in-the-loop** — client reviews prompts before execution

No implementation work needed now. The brain's AI service handles all generation internally. Sampling becomes valuable when hosted rovers exist and clients support it.

## Key files

| File                                   | Change                                                  |
| -------------------------------------- | ------------------------------------------------------- |
| `shell/mcp-service/src/mcp-service.ts` | Add `registerResourceTemplate()`, `registerPrompt()`    |
| `shell/mcp-service/src/types.ts`       | Add `PluginResourceTemplate`, `PluginPrompt` interfaces |
| `interfaces/mcp/src/mcp-interface.ts`  | Register brain resources and generic prompts            |
| `shell/plugins/src/service/context.ts` | Expose prompt registration on plugin context            |
| `plugins/system/src/plugin.ts`         | Register create/generate/review/publish prompts         |
| `plugins/blog/src/plugin.ts`           | Register write-essay prompt (optional)                  |
| `plugins/social-media/src/plugin.ts`   | Register share prompt (optional)                        |

## Verification

1. `bun run typecheck` / `bun test` / `bun run lint`
2. MCP Inspector: `resources/list` returns brain + entity resources
3. MCP Inspector: `resources/read` with `entity://post/my-post-id` returns markdown
4. MCP Inspector: `prompts/list` returns all registered prompts
5. MCP Inspector: `prompts/get` with `create { type: "post" }` returns correct messages
6. Claude Desktop: resources visible in resource browser
7. Claude Desktop: prompts visible in prompt picker
8. Permission enforcement: public user can read profile, not entity content
