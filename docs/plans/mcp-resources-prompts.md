# Plan: MCP Resources & Prompts

## Context

The brain exposes all functionality as MCP tools, but tools are the only MCP primitive we use. Resources and prompts are spec features that MCP clients (Claude Desktop, Cursor, VS Code) actively support and surface in their UIs.

**Current state:**

- Tools: 20+ registered, permission-controlled, fully integrated
- Resources: `brain://identity`, `brain://profile`, `entity://types` (in system plugin)
- Prompts: none
- Sampling: not supported by Claude Desktop yet — deferred

**Why this matters:**

- Resources make the brain **browsable** — clients can list and read content without tool calls
- Prompts make the brain **accessible** — users discover workflows in the client's prompt picker instead of typing from scratch
- Both reduce friction for non-technical users and MCP clients that surface these in their UI

## Phase 1: Resources

### Resource ownership

Resources are registered by the plugin that owns the data, not by the MCP transport:

| URI pattern            | Owner        | Description                 | Returns                                         | Status |
| ---------------------- | ------------ | --------------------------- | ----------------------------------------------- | ------ |
| `brain://identity`     | system       | Brain character             | JSON: name, role, purpose, values               | ✅     |
| `brain://profile`      | system       | Anchor profile              | JSON: name, bio, expertise                      | ✅     |
| `entity://types`       | system       | All registered entity types | Text: newline-separated type names              | ✅     |
| `entity://{type}`      | system       | List entities of a type     | JSON: array of `{ id, title, status, updated }` |        |
| `entity://{type}/{id}` | system       | Read a single entity        | Markdown: full entity content with frontmatter  |        |
| `brain://site`         | site-builder | Site metadata               | JSON: title, description, domain, URLs          |        |

### URI templates

The MCP SDK supports `resource()` with a `ResourceTemplate` for parameterized URIs. The `{type}` and `{id}` segments are resolved at read time.

Resource templates need a new registration path through the plugin system. Currently `PluginResource` has a fixed `uri: string`. Templates need:

1. A `PluginResourceTemplate` type with `uriTemplate` instead of `uri`
2. A `registerResourceTemplate()` method on MCPService
3. Plugin capabilities extended to include `resourceTemplates`

```typescript
// New type in mcp-service/types.ts
export interface PluginResourceTemplate {
  name: string;
  uriTemplate: string;
  description?: string;
  mimeType?: string;
  /** List all concrete resources matching this template */
  list?: () => Promise<Array<{ uri: string; name: string }>>;
  /** Read a single resource by resolved variables */
  handler: (vars: Record<string, string>) => Promise<{
    contents: Array<{ text: string; uri: string; mimeType?: string }>;
  }>;
}
```

```typescript
// Registration in MCPService wraps the SDK's ResourceTemplate
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

public registerResourceTemplate(
  pluginId: string,
  template: PluginResourceTemplate,
): void {
  const sdkTemplate = new ResourceTemplate(template.uriTemplate, {
    list: template.list
      ? async () => (await template.list!()).map(r => ({ uri: new URL(r.uri), name: r.name }))
      : undefined,
  });

  this.mcpServer.resource(
    template.name,
    sdkTemplate,
    async (uri, vars) => template.handler(vars),
  );
}
```

### How entity list/detail resources work

The system plugin registers two resource templates during `onRegister`:

```typescript
// entity://{type} — list entities
context.resources.registerTemplate({
  name: "entity-list",
  uriTemplate: "entity://{type}",
  description: "List entities of a given type",
  mimeType: "application/json",
  list: async () => {
    // Return one entry per registered entity type
    const types = context.entityService.getEntityTypes();
    return types.map((t) => ({ uri: `entity://${t}`, name: `${t} entities` }));
  },
  handler: async (vars) => {
    const entities = await context.entityService.listEntities(vars.type);
    const items = entities.map((e) => ({
      id: e.id,
      entityType: e.entityType,
      title: e.metadata.title,
      status: e.metadata.status,
      updated: e.updated,
    }));
    return {
      contents: [
        {
          uri: `entity://${vars.type}`,
          mimeType: "application/json",
          text: JSON.stringify(items, null, 2),
        },
      ],
    };
  },
});

// entity://{type}/{id} — read single entity
context.resources.registerTemplate({
  name: "entity-detail",
  uriTemplate: "entity://{type}/{id}",
  description: "Read a single entity by type and ID",
  mimeType: "text/markdown",
  handler: async (vars) => {
    const entity = await context.entityService.getEntity(vars.type, vars.id);
    if (!entity) throw new Error(`Entity not found: ${vars.type}/${vars.id}`);
    return {
      contents: [
        {
          uri: `entity://${vars.type}/${vars.id}`,
          mimeType: "text/markdown",
          text: entity.content,
        },
      ],
    };
  },
});
```

### brain://site resource (site-builder)

Site-builder registers a fixed resource for site metadata during `onRegister`:

```typescript
// In site-builder plugin
{
  uri: "brain://site",
  name: "Site Info",
  description: "Site metadata — title, description, domain, URLs",
  mimeType: "application/json",
  handler: async () => {
    const siteInfo = await this.siteInfoService.getSiteInfo();
    return {
      contents: [{
        uri: "brain://site",
        mimeType: "application/json",
        text: JSON.stringify({
          ...siteInfo,
          domain: context.domain,
          siteUrl: context.siteUrl,
          previewUrl: context.previewUrl,
        }, null, 2),
      }],
    };
  },
}
```

### Permission model

Resources inherit the same permission model as tools:

- `brain://identity` — public
- `brain://profile` — public
- `brain://site` — public
- `entity://types` — public
- `entity://{type}` — trusted (list entities)
- `entity://{type}/{id}` — trusted (read entity content)

For simplicity, start with trusted for all entity reads. Published content could be public later.

### Steps

1. ✅ Move `entity://types` from MCP interface to system plugin
2. ✅ Add `brain://identity` and `brain://profile` resources to system plugin
3. Add `PluginResourceTemplate` type to `mcp-service/types.ts`
4. Add `registerResourceTemplate()` to MCPService
5. Add `resources.registerTemplate()` to plugin context
6. Register `entity://{type}` resource template in system plugin
7. Register `entity://{type}/{id}` resource template in system plugin
8. Add `brain://site` resource to site-builder plugin
9. Tests for all new resources

## Phase 2: Prompts

### What we expose

| Prompt name  | Arguments                             | Owner  | Description                                               |
| ------------ | ------------------------------------- | ------ | --------------------------------------------------------- |
| `create`     | `type` (required), `topic` (optional) | system | Create new content — routes to system_create              |
| `generate`   | `type` (required), `topic` (required) | system | AI-generate content — routes to system_create with prompt |
| `review`     | `type` (required), `id` (required)    | system | Load entity and ask for feedback/improvements             |
| `publish`    | `type` (required), `id` (required)    | system | Guided publishing — preview, confirm, publish             |
| `brainstorm` | `topic` (required)                    | system | Ideation session with brain context and expertise         |

### How prompts work in MCP

Prompts are parameterized message templates that clients discover via `prompts/list` and invoke via `prompts/get`. The server returns a list of messages (system + user) that the client uses to start a conversation.

### New types

```typescript
// In mcp-service/types.ts
export interface PluginPrompt {
  name: string;
  description?: string;
  args: Record<string, { description: string; required?: boolean }>;
  handler: (args: Record<string, string>) => Promise<{
    messages: Array<{
      role: "user" | "assistant";
      content: { type: "text"; text: string };
    }>;
  }>;
}
```

### Registration flow

```typescript
// MCPService.registerPrompt() wraps the SDK
public registerPrompt(pluginId: string, prompt: PluginPrompt): void {
  this.mcpServer.prompt(
    prompt.name,
    prompt.description ?? `Prompt from ${pluginId}`,
    // Convert args to Zod schemas for the SDK
    Object.fromEntries(
      Object.entries(prompt.args).map(([key, arg]) => [
        key,
        arg.required ? z.string().describe(arg.description) : z.string().optional().describe(arg.description),
      ])
    ),
    async (args) => prompt.handler(args),
  );
}
```

### System plugin prompt implementations

```typescript
// create — start content creation
{
  name: "create",
  description: "Create new content of any type",
  args: {
    type: { description: "Entity type (post, deck, note, project, etc.)", required: true },
    topic: { description: "Topic or title for the content" },
  },
  handler: async ({ type, topic }) => ({
    messages: [{
      role: "user",
      content: { type: "text",
        text: topic
          ? `Create a new ${type} about: ${topic}`
          : `Create a new ${type}. Ask me what it should be about.`,
      },
    }],
  }),
}

// review — load entity and get feedback
{
  name: "review",
  description: "Review and improve existing content",
  args: {
    type: { description: "Entity type", required: true },
    id: { description: "Entity ID or slug", required: true },
  },
  handler: async ({ type, id }) => ({
    messages: [{
      role: "user",
      content: { type: "text",
        text: `Review my ${type} "${id}". Read it first, then give me specific feedback on structure, clarity, and impact. Suggest concrete improvements.`,
      },
    }],
  }),
}
```

### Plugin-contributed prompts (future)

Plugins can register prompts for domain-specific workflows:

| Plugin       | Prompt               | Arguments             | Description                            |
| ------------ | -------------------- | --------------------- | -------------------------------------- |
| blog         | `write-essay`        | `topic`, `series?`    | Blog post with optional series context |
| social-media | `share`              | `topic?`, `platform?` | Social post with platform guidance     |
| newsletter   | `compose-newsletter` | `theme?`              | Newsletter from recent content         |
| site-builder | `build-site`         | `environment?`        | Build and preview the site             |

These are optional enhancements — the generic prompts cover most cases.

### Steps

1. Add `PluginPrompt` type to `mcp-service/types.ts`
2. Add `registerPrompt()` to MCPService
3. Add `prompts.register()` to plugin context
4. Register generic prompts in system plugin: create, generate, review, publish, brainstorm
5. Tests

## Phase 3: Sampling (Future)

Deferred until Claude Desktop supports it. No implementation work needed now.

## Key files

| File                                    | Change                                                     | Status |
| --------------------------------------- | ---------------------------------------------------------- | ------ |
| `interfaces/mcp/src/mcp-interface.ts`   | ✅ Removed `entity://types` (moved to system plugin)       | ✅     |
| `plugins/system/src/plugin.ts`          | ✅ `brain://identity`, `brain://profile`, `entity://types` | ✅     |
| `plugins/system/test/resources.test.ts` | ✅ Tests for static resources                              | ✅     |
| `shell/mcp-service/src/types.ts`        | Add `PluginResourceTemplate`, `PluginPrompt`               |        |
| `shell/mcp-service/src/mcp-service.ts`  | Add `registerResourceTemplate()`, `registerPrompt()`       |        |
| `shell/plugins/src/service/context.ts`  | Add `resources.registerTemplate()`, `prompts.register()`   |        |
| `shell/plugins/src/interfaces.ts`       | Add template/prompt registration to IShell                 |        |
| `plugins/system/src/plugin.ts`          | Add entity resource templates + prompts                    |        |
| `plugins/site-builder/src/plugin.ts`    | Add `brain://site` resource                                |        |

## Verification

1. `bun run typecheck` / `bun test` / `bun run lint`
2. MCP Inspector: `resources/list` returns brain + entity resources
3. MCP Inspector: `resources/read` with `entity://post/my-post-id` returns markdown
4. MCP Inspector: `prompts/list` returns all registered prompts
5. MCP Inspector: `prompts/get` with `create { type: "post" }` returns correct messages
6. Claude Desktop: resources visible in resource browser
7. Claude Desktop: prompts visible in prompt picker
8. Permission enforcement: public user can read profile, not entity content
