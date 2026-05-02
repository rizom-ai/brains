# Plugin Development Quick Reference

Use this as a compact checklist for choosing and authoring plugins. For full external package guidance, see [External Plugin Authoring](./external-plugin-authoring.md). For minimal standalone references, see [`rizom-ai/brain-plugin-hello`](https://github.com/rizom-ai/brain-plugin-hello) and [`rizom-ai/brain-plugin-recipes`](https://github.com/rizom-ai/brain-plugin-recipes).

## Choose a base class

| Need                                                                        | Use                      |
| --------------------------------------------------------------------------- | ------------------------ |
| Add a durable markdown-backed entity type                                   | `EntityPlugin`           |
| Add tools, resources, jobs, integrations, templates, or background behavior | `ServicePlugin`          |
| Add a non-chat transport, daemon, HTTP route, or interface                  | `InterfacePlugin`        |
| Add a chat/channel transport                                                | `MessageInterfacePlugin` |

## Import rules

External packages:

```ts
import { ServicePlugin, type PluginFactory } from "@rizom/brain/plugins";
import type { BaseEntity, EntityAdapter } from "@rizom/brain/entities";
import type { WebRouteDefinition } from "@rizom/brain/interfaces";
import { z } from "zod";
```

Do not import internal `@brains/*` packages from external plugins.

## Lifecycle hooks

| Hook                  | Use for                                                              |
| --------------------- | -------------------------------------------------------------------- |
| `onRegister(context)` | registering capabilities, routes, handlers, subscriptions            |
| `onReady(context)`    | startup work that needs identity/profile or other registered plugins |
| `onShutdown()`        | cleanup                                                              |

Do not start long-running work before registration is complete. Daemons and job processing start after ready hooks.

## Service plugin skeleton

```ts
import {
  ServicePlugin,
  createTool,
  toolSuccess,
  type PluginFactory,
  type Tool,
} from "@rizom/brain/plugins";
import { z } from "zod";

const packageJson = { name: "@acme/brain-plugin-demo", version: "0.1.0" };
const configSchema = z.object({ greeting: z.optional(z.string()) });

type Config = z.infer<typeof configSchema>;

class DemoServicePlugin extends ServicePlugin<Config> {
  constructor(config: Partial<Config> = {}) {
    super("demo", packageJson, config, configSchema);
  }

  protected override async getTools(): Promise<Tool[]> {
    return [
      createTool({
        name: "demo_greet",
        description: "Return a greeting.",
        inputSchema: { name: z.optional(z.string()) },
        handler: () => toolSuccess({ message: "hello" }),
      }),
    ];
  }
}

export const plugin: PluginFactory = (config) => new DemoServicePlugin(config);
export default plugin;
```

## Entity plugin skeleton

```ts
import { EntityPlugin, type PluginFactory } from "@rizom/brain/plugins";
import type { BaseEntity, EntityAdapter } from "@rizom/brain/entities";
import { z } from "zod";

interface NoteEntity extends BaseEntity<{ title: string }> {
  entityType: "note";
  metadata: { title: string };
}

const noteSchema: z.ZodSchema<NoteEntity> = z.object({
  id: z.string(),
  entityType: z.literal("note"),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  metadata: z.object({ title: z.string() }),
  contentHash: z.string(),
});

const adapter: EntityAdapter<NoteEntity, { title: string }> = {
  entityType: "note",
  schema: noteSchema,
  toMarkdown: (entity) => entity.content,
  fromMarkdown: (markdown) => ({ content: markdown }),
  extractMetadata: (entity) => entity.metadata,
  parseFrontMatter: (_markdown, schema) => schema.parse({ title: "Note" }),
  generateFrontMatter: (entity) => `title: ${entity.metadata.title}`,
  getBodyTemplate: () => "",
};

class NotePlugin extends EntityPlugin<NoteEntity> {
  readonly entityType = "note";
  readonly schema = noteSchema;
  readonly adapter = adapter;

  constructor() {
    super(
      "note",
      { name: "@acme/brain-plugin-note", version: "0.1.0" },
      {},
      z.object({}),
    );
  }
}

export const plugin: PluginFactory = () => new NotePlugin();
```

## Message interface skeleton

```ts
import {
  MessageInterfacePlugin,
  type JobProgressEvent,
  type PluginFactory,
} from "@rizom/brain/plugins";
import { z } from "zod";

class ChatPlugin extends MessageInterfacePlugin {
  constructor() {
    super(
      "chat",
      { name: "@acme/brain-plugin-chat", version: "0.1.0" },
      {},
      z.object({}),
    );
  }

  protected sendMessageToChannel(
    channelId: string | null,
    message: string,
  ): void {
    // Send through your platform SDK.
    console.log(channelId, message);
  }

  protected override async onProgressUpdate(
    event: JobProgressEvent,
  ): Promise<void> {
    void event.id;
  }
}

export const plugin: PluginFactory = () => new ChatPlugin();
```

## `brain.yaml` external plugin entry

```yaml
plugins:
  demo:
    package: "@acme/brain-plugin-demo"
    config:
      greeting: Hello
```

The package version belongs in the instance `package.json`. The factory receives only the nested `config` object.

## Validation checklist

- Package exports a default or named `plugin` factory.
- Package declares `@rizom/brain` as a peer dependency.
- Package imports `zod` directly if it needs schemas.
- Published declarations do not reference `@brains/*`.
- Examples typecheck against `@rizom/brain/*`, not monorepo paths.
- Smoke tests can use `brain start --startup-check` to prove `onRegister`/`onReady` without starting daemons or job workers.
