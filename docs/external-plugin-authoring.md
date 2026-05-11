# External Plugin Authoring

External plugin packages use the public `@rizom/brain` authoring API and are loaded by brain instances from `brain.yaml`.

## Package shape

A plugin package should declare `@rizom/brain` as a peer dependency. The instance `package.json` chooses the plugin package version; `brain.yaml` only declares and configures it.

```json
{
  "name": "@rizom/brain-plugin-calendar",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "peerDependencies": {
    "@rizom/brain": "^0.2.0-alpha.54",
    "zod": "^3.0.0"
  }
}
```

Do not import internal `@brains/*` workspaces from external plugins. `PLUGIN_API_VERSION` is available from the root `@rizom/brain` export for diagnostics; compatibility during alpha is enforced through `peerDependencies`. The minimal reference package is [`rizom-ai/brain-plugin-hello`](https://github.com/rizom-ai/brain-plugin-hello). `ServicePlugin`, `EntityPlugin`, `InterfacePlugin`, and `MessageInterfacePlugin` are available from the curated public API; use public subpaths for supporting contracts:

- `@rizom/brain`
- `@rizom/brain/plugins`
- `@rizom/brain/entities`
- `@rizom/brain/services`
- `@rizom/brain/interfaces`
- `@rizom/brain/templates`

## Plugin factory contract

Export a plugin factory as either the default export or a named `plugin` export. Exporting both is fine.

```ts
import {
  ServicePlugin,
  createTool,
  toolSuccess,
  type PluginFactory,
  type ServicePluginContext,
  type Tool,
} from "@rizom/brain/plugins";
import { z } from "zod";

interface CalendarConfig {
  timezone?: string;
}

const configSchema = z.object({
  timezone: z.optional(z.string()),
});

const packageJson = {
  name: "@rizom/brain-plugin-calendar",
  version: "0.1.0",
  description: "Calendar integration",
};

class CalendarPlugin extends ServicePlugin<CalendarConfig> {
  constructor(config: Partial<CalendarConfig> = {}) {
    super("calendar", packageJson, config, configSchema);
  }

  protected override async onRegister(
    _context: ServicePluginContext,
  ): Promise<void> {
    // Register capabilities, tools, resources, routes, jobs, and subscriptions.
  }

  protected override async onReady(
    _context: ServicePluginContext,
  ): Promise<void> {
    // Identity/profile and other plugins are ready here.
  }

  protected override async getTools(): Promise<Tool[]> {
    return [
      createTool({
        name: "calendar_ping",
        description: "Check that the calendar plugin is loaded.",
        inputSchema: {},
        handler: () => toolSuccess({ ok: true }),
      }),
    ];
  }
}

export const plugin: PluginFactory = (config) => new CalendarPlugin(config);
export default plugin;
```

The repository keeps a package-local compile fixture at [`packages/brain-cli/test/fixtures/external-plugin`](../packages/brain-cli/test/fixtures/external-plugin). It typechecks against the public `.d.ts` contracts and must not import `@brains/*`. For a durable entity example, see [`rizom-ai/brain-plugin-recipes`](https://github.com/rizom-ai/brain-plugin-recipes).

## Entity service and entity namespace

Public plugin contexts expose entity capabilities through two deliberately separate surfaces:

- `context.entityService` for read/query operations such as `getEntity<T extends BaseEntity>()`, `listEntities<T extends BaseEntity>()`, `search<T extends BaseEntity>()`, counts, and entity-type discovery.
- `context.entities` for registration and controlled writes such as `register`, `update`, `registerDataSource`, and `registerCreateInterceptor`.

`search<T>()` returns `SearchResult<T>[]`, not bare entities. Import `BaseEntity`, `ListOptions`, `SearchOptions`, and `SearchResult` from `@rizom/brain/entities` when you need typed entity access.

## Registration model

Capabilities are registered through a documented hybrid: **class methods** for static declarations the shell collects automatically, and **`context.*.register*()` calls** inside `onRegister` for anything dynamic, conditional, or namespaced.

Class-method registration (auto-collected at boot):

| Override                                                | Use for                                                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `getTools()`                                            | Tools exposed through the plugin's namespace                                                  |
| `getResources()`                                        | Static resources                                                                              |
| `getInstructions()`                                     | A string appended to the agent's system prompt                                                |
| `getApiRoutes()` / `getWebRoutes()` (interface/service) | Route definitions                                                                             |
| `registerEntityTypes(context)` (`ServicePlugin`)        | Default `onRegister` calls this for you so subclasses can register entity types declaratively |
| `registerJobHandlers(context)` (`ServicePlugin`)        | Same pattern for job handlers                                                                 |

Reach for class methods when the set of capabilities is fixed at construction time — the example in [Plugin factory contract](#plugin-factory-contract) above uses `getTools()` for exactly that reason.

Context-call registration (inside `onRegister`):

```ts
protected override async onRegister(context: ServicePluginContext): Promise<void> {
  context.entities.register("note", noteSchema, noteAdapter);
  context.entities.registerCreateInterceptor("note", interceptor);
  context.entities.registerDataSource(myDataSource);
  context.templates.register({ "note-card": noteCardTemplate }, "notes");
  context.registerInstructions("Notes use ISO-8601 timestamps in frontmatter.");
}
```

Reach for context calls when registration is conditional on config, when you need a namespace different from the plugin id (the optional second arg to `templates.register`), or when the capability isn't a fit for one of the static class methods. For long-running background work, `InterfacePlugin` subclasses typically override `createDaemon()` (static-style) and the base class registers it during `register()`; for ad-hoc cases, call `context.daemons.register(...)` directly. If you override `onRegister` on `ServicePlugin`, call `super.onRegister(context)` first so `registerEntityTypes` / `registerJobHandlers` still fire.

## Messaging interfaces

Use `InterfacePlugin` for generic/non-chat interfaces. Use `MessageInterfacePlugin` when building a channel/chat surface such as Slack, Teams, Matrix, Telegram, or Discord. It extends `InterfacePlugin` with shared message-routing helpers, progress-message tracking, URL capture helpers, and text-upload validation.

```ts
import {
  MessageInterfacePlugin,
  type JobProgressEvent,
  type PluginFactory,
} from "@rizom/brain/plugins";
import { z } from "zod";

const packageJson = {
  name: "@rizom/brain-plugin-chat-example",
  version: "0.1.0",
};

class ChatExamplePlugin extends MessageInterfacePlugin {
  constructor() {
    super("chat-example", packageJson, {}, z.object({}));
  }

  protected sendMessageToChannel(
    channelId: string | null,
    message: string,
  ): void {
    // Send `message` through your platform SDK.
    console.log(channelId, message);
  }

  protected override async onProgressUpdate(
    event: JobProgressEvent,
  ): Promise<void> {
    // Optional: mirror progress into platform-specific UI state.
    void event.id;
  }
}

export const plugin: PluginFactory = () => new ChatExamplePlugin();
export default plugin;
```

## Loading from `brain.yaml`

Install the plugin in the instance package:

```json
{
  "dependencies": {
    "@rizom/brain-plugin-calendar": "^0.1.0"
  }
}
```

Declare and configure it in `brain.yaml`:

```yaml
plugins:
  calendar:
    package: "@rizom/brain-plugin-calendar"
    config:
      timezone: UTC
      apiKey: ${CALENDAR_API_KEY}
```

Rules:

- `plugins:` remains a keyed map, not a list.
- `package` is reserved for external plugin declarations.
- External plugin config must live under nested `config`.
- The factory receives only that nested `config` object.
- `add`/`remove` use the `plugins:` map key for selection, while returned plugin instances keep their own `plugin.id`.

## Lifecycle

- `onRegister` registers capabilities and subscriptions.
- `onReady` runs after identity/profile and plugin registration are complete.
- `onShutdown` handles cleanup.

Background daemons and job processing start after ready hooks, so `onReady` is the place for startup work that needs the coordinated shell state.

## Smoke testing

Use startup-check mode for external plugin CI smoke tests:

```bash
brain start --startup-check
```

This boots far enough to load external `brain.yaml` plugins and run their `onRegister`/`onReady` lifecycle hooks, then exits without starting daemons or job workers and without requiring `AI_API_KEY`.

## See also

- [Plugin System](./plugin-system.md)
- [brain.yaml Reference](../packages/brain-cli/docs/brain-yaml-reference.md)
