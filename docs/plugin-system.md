# Plugin System

`brains` is composed from three plugin families:

- **Entity plugins** — define typed markdown content, schemas, indexing behavior, and entity-specific create/extract hooks
- **Service plugins** — provide tools, jobs, integrations, and background behavior such as site building, syncing, analytics, or publishing
- **Interface plugins** — expose a running brain over transports like MCP, web, Discord, A2A, or the chat REPL

## How plugins fit together

A **brain model** declares the available plugins and presets.

A **brain instance** selects a preset, can `add` or `remove` individual plugins in `brain.yaml`, and can override per-plugin configuration under `plugins:`.

At runtime, the shell loads the selected plugins, wires them into shared services, and exposes the combined tool/resource/interface surface.

## External plugin packages

External plugins should import from the curated public API, not internal `@brains/*` workspaces:

```ts
import { ServicePlugin, type PluginFactory } from "@rizom/brain/plugins";

class CalendarPlugin extends ServicePlugin<{ timezone?: string }> {
  id = "calendar";
  version = "0.1.0";
  description = "Calendar integration";

  async onRegister() {
    // register tools, resources, jobs, routes, etc.
  }
}

export const plugin: PluginFactory = (config) => new CalendarPlugin(config);
export default plugin;
```

Instances load installed plugins through `brain.yaml`:

```yaml
plugins:
  calendar:
    package: "@rizom/brain-plugin-calendar"
    config:
      timezone: UTC
```

The plugin package version belongs in the instance `package.json`. Plugin packages declare compatible `@rizom/brain` versions with `peerDependencies`.

## Read next

- [Architecture Overview](./architecture-overview.md)
- [Brain Model & Instance Architecture](./brain-model.md)
- [Plugin Development Patterns](./plugin-development-patterns.md)
- [Plugin Quick Reference](./plugin-quick-reference.md)
- [entities/AGENTS.md](../entities/AGENTS.md)
- [plugins/AGENTS.md](../plugins/AGENTS.md)
- [interfaces/AGENTS.md](../interfaces/AGENTS.md)
- [plugins/examples/](../plugins/examples/)

## Note on plugin authoring docs

The older standalone plugin-authoring docs have been consolidated into the repository `AGENTS.md` files and example packages. This page exists as the stable entry point referenced by the README, roadmap, and contributing docs.
