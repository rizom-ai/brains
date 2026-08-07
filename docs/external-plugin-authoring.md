# External Package Authoring

External packages use declarative definitions from the public `@rizom/brain` authoring API. They do not subclass runtime plugins or export factories.

## Package shape

Publish one canonical package definition as the package default. Declare `@rizom/brain` as a peer dependency and keep the range within the stable `0.2.x` lane:

```json
{
  "name": "@example/calendar",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "peerDependencies": {
    "@rizom/brain": ">=0.2.0 <0.3.0"
  }
}
```

Do not import internal `@brains/*` workspaces, package manifests, or `zod` directly. Each family entry point exports its blessed `z` instance:

| Package kind             | Entry point               | Definition helper          |
| ------------------------ | ------------------------- | -------------------------- |
| Entity package           | `@rizom/brain/entities`   | `defineEntityPackage()`    |
| Service package          | `@rizom/brain/services`   | `defineServicePlugin()`    |
| HTTP/event interface     | `@rizom/brain/interfaces` | `defineInterface()`        |
| Conversational interface | `@rizom/brain/interfaces` | `defineMessageInterface()` |
| Site package             | `@rizom/site`             | `defineSite()`             |

## Declarative package definition

A service package declares its schema and capabilities once:

```ts
import { defineServicePlugin, defineTool, z } from "@rizom/brain/services";

export default defineServicePlugin({
  id: "calendar",
  config: z.object({
    timezone: z.string().default("UTC"),
  }),
  tools: ({ config }) => [
    defineTool({
      name: "calendar-timezone",
      description: "Return the configured calendar timezone.",
      input: z.object({}),
      output: z.object({ timezone: z.string() }),
      execute: () => ({ timezone: config.timezone }),
    }),
  ],
});
```

Configuration supplied through `use()` and `brain.yaml` is inferred from the schema input. Callbacks receive the parsed schema output, including defaults and transforms.

The loader supplies the installed package name and version. Author source chooses only local domain IDs; runtime capability IDs are package-scoped automatically.

## Brain composition

The brain-definition package imports definitions and configures them with `use()`:

```ts
import calendar from "@example/calendar";
import { defineBrain, defineBundle, use } from "@rizom/brain";

const configuredCalendar = use(calendar, { timezone: "Europe/Paris" });
const core = defineBundle({
  id: "core",
  members: [configuredCalendar],
});

export default defineBrain({
  name: "personal-calendar",
  plugins: [configuredCalendar],
  bundles: [core],
});
```

Secrets remain instance concerns and should be supplied through `brain.yaml` environment interpolation rather than package defaults.

## Registration model

Definition fields are the registration model. The runtime validates and finalizes tools, resources, jobs, routes, daemons, entities, projections, channel descriptors, and lifecycle resources. Author packages do not receive registries or shell objects and do not branch on process roles.

Long-running work belongs in supervised interface daemons. Durable work belongs in schema-first service jobs. Entity derivation belongs in projection definitions. This keeps lifecycle, worker isolation, shutdown, and rollback runtime-owned.

## Removed alpha package shapes

Stable `0.2.x` does not load class constructors, tuple factories, default plugin functions, named `plugin` factories, or `brain.yaml` plugin package declarations. The loader reports migration guidance when it encounters those alpha shapes. Move package imports into a `defineBrain()` package and compose their default definitions with `use()`.

## Canonical examples

The checked standalone packages under [`packages/brain-cli/test/fixtures/public-authoring`](../packages/brain-cli/test/fixtures/public-authoring) are the authoritative examples for entity, service, site, generic interface, message-interface, and root brain-definition authoring. They compile against generated declarations and are exercised through isolated packed installs.
