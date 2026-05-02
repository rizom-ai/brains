# Plugin System

`brains` is composed from plugin packages. A brain model declares a set of built-in capabilities and interfaces; a brain instance selects from them and can also load external plugin packages from `node_modules`.

## Plugin families

Use the smallest base class that matches the job:

| Family            | Public base class        | Use for                                                     | Examples                                   |
| ----------------- | ------------------------ | ----------------------------------------------------------- | ------------------------------------------ |
| Entity            | `EntityPlugin`           | Durable markdown-backed content types with schemas/adapters | blog posts, links, topics, images          |
| Service           | `ServicePlugin`          | Tools, resources, jobs, integrations, background services   | site building, sync, analytics, publishing |
| Interface         | `InterfacePlugin`        | Non-chat user-facing transports, HTTP routes, daemons       | MCP, A2A, webserver-style integrations     |
| Message interface | `MessageInterfacePlugin` | Chat/channel transports with conversation semantics         | Discord, Slack, Teams, Matrix, Telegram    |

`MessageInterfacePlugin` is optional sugar over `InterfacePlugin`. Use it when the integration is a messaging surface and you want shared progress-message tracking, URL capture helpers, text-upload validation, and input buffering. Use `InterfacePlugin` directly for non-chat interfaces.

## Public authoring imports

External plugin packages must import from `@rizom/brain/*` public subpaths, not internal `@brains/*` workspaces.

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
```

Useful public subpaths:

- `@rizom/brain/plugins` — plugin base classes, contexts, tool/resource helpers, public DTO schemas
- `@rizom/brain/entities` — entity schemas, adapters, datasource contracts
- `@rizom/brain/interfaces` — route, daemon, permission, and messaging contracts
- `@rizom/brain/services` — service datasource helpers
- `@rizom/brain/templates` — template and renderer contracts

## Lifecycle

Public plugin lifecycle hooks are:

- `onRegister(context)` — register capabilities, routes, jobs, subscriptions, entity types, and static resources.
- `onReady(context)` — startup work that depends on identity/profile or on other plugins having registered.
- `onShutdown()` — cleanup.

The shell calls all plugin registration hooks first, prepares ready state, then calls ready hooks. Background daemons and job processing start after ready hooks.

## Registration model

Plugins register capabilities through a hybrid: override class methods (`getTools`, `getResources`, `getInstructions`, `getApiRoutes`, `getWebRoutes`, and on `ServicePlugin` the `registerEntityTypes` / `registerJobHandlers` hooks) for static declarations the shell collects automatically, and call `context.*.register*()` inside `onRegister` for dynamic, conditional, or namespaced registration (entity types, templates, data sources, daemons, instructions). See [External Plugin Authoring → Registration model](./external-plugin-authoring.md#registration-model) for the full breakdown.

## Plugin factory contract

External packages export a default or named `plugin` factory. Exporting both is fine.

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
    // Register subscriptions, routes, jobs, or instructions here.
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

## Loading external packages

Install the external plugin in the instance package and declare it in `brain.yaml`.

```json
{
  "dependencies": {
    "@rizom/brain-plugin-calendar": "^0.1.0"
  }
}
```

```yaml
plugins:
  calendar:
    package: "@rizom/brain-plugin-calendar"
    config:
      timezone: UTC
      apiKey: ${CALENDAR_API_KEY}
```

Rules:

- `plugins:` is a keyed map, not a list.
- `package` is reserved for external package declarations.
- External plugin configuration lives under nested `config`.
- The factory receives only that nested `config` object.
- Package versions live in `package.json`, not `brain.yaml`.
- External packages declare compatible `@rizom/brain` versions with `peerDependencies`.

## Internal plugin development

Internal workspace plugins use the same architecture but may import workspace-private packages according to the local `AGENTS.md` file for their directory.

- Entity plugin rules: [`entities/AGENTS.md`](../entities/AGENTS.md)
- Service plugin rules: [`plugins/AGENTS.md`](../plugins/AGENTS.md)
- Interface plugin rules: [`interfaces/AGENTS.md`](../interfaces/AGENTS.md)

## Read next

- [External Plugin Authoring](./external-plugin-authoring.md)
- [Plugin Quick Reference](./plugin-quick-reference.md)
- [Architecture Overview](./architecture-overview.md)
- [brain.yaml Reference](../packages/brain-cli/docs/brain-yaml-reference.md)
