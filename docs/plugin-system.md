# Plugin System

`brains` composes behavior from package definitions. External authors declare domain capabilities; the runtime normalizes those definitions into its internal plugin lifecycle.

## Public definition families

Choose the narrowest family:

| Family            | Public helper              | Use for                                                             |
| ----------------- | -------------------------- | ------------------------------------------------------------------- |
| Entity            | `defineEntityPackage()`    | Durable markdown-backed entities and deterministic projections      |
| Service           | `defineServicePlugin()`    | Tools, resources, prompts, templates, views, jobs, and integrations |
| Interface         | `defineInterface()`        | HTTP routes and supervised non-chat listeners                       |
| Message interface | `defineMessageInterface()` | Conversational and outbound channels                                |
| Site              | `defineSite()`             | Layouts, routes, sections, content, display metadata, and assets    |

A package default-exports one definition. Packages with multiple concerns remain focused and are composed in the brain-definition package.

## Public authoring imports

External packages import one family entry point, not internal `@brains/*` workspaces:

```ts
import { defineServicePlugin, defineTool, z } from "@rizom/brain/services";
```

The stable entries are:

- `@rizom/brain` — root composition with `defineBrain()`, `defineBundle()`, and `use()`;
- `@rizom/brain/entities` — entity and projection definitions;
- `@rizom/brain/services` — service, tool, and job definitions;
- `@rizom/brain/interfaces` — route, daemon, and message-interface definitions; and
- `@rizom/site` — site and schema-first section definitions.

`@rizom/brain/plugins` contains only nominated advanced shared contracts. It is not a class-first fallback authoring API.

## Configuration and package identity

Each definition owns one config schema. `use()` and `brain.yaml` accept its inferred input. Runtime callbacks receive the parsed output after defaults and transforms.

The installed package manifest supplies package name and version. Local IDs are scoped by that identity at runtime. External definitions do not import package manifests or construct fully qualified capability names.

Every external package declares a compatible `@rizom/brain` peer range. The loader verifies the installed version explicitly before registration.

## Brain composition

A brain-definition package imports package defaults and creates configured references:

```ts
import calendar from "@example/calendar";
import { defineBrain, defineBundle, use } from "@rizom/brain";

const configuredCalendar = use(calendar, { timezone: "UTC" });
const core = defineBundle({
  id: "core",
  members: [configuredCalendar],
});

export default defineBrain({
  name: "calendar-brain",
  plugins: [configuredCalendar],
  bundles: [core],
});
```

Instance YAML selects bundle IDs and supplies deployment-specific config. It does not import authoring factories.

## Runtime lifecycle

The internal runtime adapts definitions to its registration lifecycle:

1. validate final merged config;
2. create package-owned setup state when the definition declares it;
3. register declared capabilities transactionally;
4. finalize registration before ready work;
5. start worker jobs and web daemons in their owned process roles; and
6. release lifecycle-owned resources during terminal shutdown.

Registration failure rolls back capabilities acquired by that definition. Authors declare jobs, daemons, routes, projections, and channel behavior without receiving registries, queues, shell objects, or process-role switches.

When a declarative brain composes a generic interface, the runtime supplies the shared HTTP host automatically and activates it with the selected bundle. The interface author declares only routes and protocol security. Message listeners and all generic-interface daemons remain web-process resources and are excluded from workers.

Internal runtime classes may remain under `@brains/plugins`, but they are implementation details used by built-in workspaces. They are not exported as stable external authoring contracts.

## Removed alpha contracts

Stable `0.2.x` does not retain:

- plugin subclasses as public authoring APIs;
- tuple or default/named plugin factories;
- package metadata objects in source;
- positional tool helpers or success wrappers;
- root `z` or `PLUGIN_API_VERSION`; or
- `brain.yaml` `plugins.<id>.package` declarations.

The loader rejects legacy package declarations with migration guidance before importing their modules.

## Internal plugin development

Built-in workspace packages may use internal runtime classes according to their local `AGENTS.md` rules:

- entity package rules: [`entities/AGENTS.md`](../entities/AGENTS.md);
- service package rules: [`plugins/AGENTS.md`](../plugins/AGENTS.md); and
- interface package rules: [`interfaces/AGENTS.md`](../interfaces/AGENTS.md).

## Read next

- [External Package Authoring](./external-plugin-authoring.md)
- [Package Authoring Quick Reference](./plugin-quick-reference.md)
- [Architecture Overview](./architecture-overview.md)
- [brain.yaml Reference](../packages/brain-cli/docs/brain-yaml-reference.md)
