# Package Authoring Quick Reference

Use this checklist when choosing a declarative extension family. For package and composition guidance, see [External Package Authoring](./external-plugin-authoring.md). The authoritative standalone examples live under [`packages/brain-cli/test/fixtures/public-authoring`](../packages/brain-cli/test/fixtures/public-authoring).

## Choose a definition family

| Need                                                          | Entry point               | Use                                                             |
| ------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------- |
| Durable markdown-backed entities and deterministic derivation | `@rizom/brain/entities`   | `defineEntity()`, `defineProjection()`, `defineEntityPackage()` |
| Tools, resources, prompts, templates, views, or durable jobs  | `@rizom/brain/services`   | `defineServicePlugin()`, `defineTool()`, `defineJob()`          |
| HTTP routes or supervised event listeners                     | `@rizom/brain/interfaces` | `defineInterface()`, `defineRoute()`, `defineDaemon()`          |
| Conversational or outbound channels                           | `@rizom/brain/interfaces` | `defineMessageInterface()`                                      |
| Site layouts, routes, sections, content, and assets           | `@rizom/site`             | `defineSite()`, `defineSection()`, `sectionGroup()`             |

Every extension package default-exports one definition. A package with several concerns composes focused packages rather than exposing runtime classes.

## Import rules

Import helpers and the blessed `z` from one family entry point:

```ts
import { defineServicePlugin, defineTool, z } from "@rizom/brain/services";
```

Do not import:

- internal `@brains/*` packages;
- `zod` directly;
- package manifests;
- runtime plugin classes, registries, queues, or process-role types.

## Configuration and setup

Declare one config schema. `use()` and `brain.yaml` accept its inferred input; definition callbacks receive its parsed output, including defaults and transforms.

```ts
export default defineServicePlugin({
  id: "demo",
  config: z.object({ greeting: z.string().default("Hello") }),
  setup: ({ config }) => ({
    greet: (name: string) => `${config.greeting}, ${name}`,
  }),
  tools: ({ state }) => [
    defineTool({
      name: "greet",
      description: "Return a greeting.",
      input: z.object({ name: z.string() }),
      output: z.object({ message: z.string() }),
      execute: ({ input }) => ({ message: state.greet(input.name) }),
    }),
  ],
});
```

Package name, version, and runtime capability scoping are loader-owned.

## Lifecycle ownership

- Use `setup` for package-owned state and resources; register teardown with `lifecycle.onCleanup()`.
- Use schema-first jobs for durable worker work.
- Use supervised interface daemons for long-running listeners.
- Use projections for deterministic entity derivation.
- Return or register nothing through shell registries; definition fields are the registration contract.
- Honor provided abort signals. Runtime shutdown and rollback own cleanup order.

## Brain composition

Import default definitions into a brain-definition package and configure them with `use()`:

```ts
import demo from "@example/demo";
import { defineBrain, defineBundle, use } from "@rizom/brain";

const configuredDemo = use(demo, { greeting: "Hi" });
const core = defineBundle({ id: "core", members: [configuredDemo] });

export default defineBrain({
  name: "example",
  plugins: [configuredDemo],
  bundles: [core],
});
```

Secrets belong in instance configuration, not package defaults.

## Validation checklist

- Package default-exports a canonical `define*` result.
- Package declares a compatible `@rizom/brain` peer range.
- Source contains no `@brains/*`, direct `zod`, package metadata import, cast, or duplicated schema-derived type.
- Generated declarations resolve only public package exports.
- Packed installation and startup run outside the monorepo.
- Deterministic behavior is covered without provider credentials; provider-backed evidence is opt-in.

Class constructors, tuple factories, named `plugin` exports, positional tools, and `brain.yaml` plugin package declarations are removed alpha contracts and are not compatibility paths in stable `0.2.x`.
