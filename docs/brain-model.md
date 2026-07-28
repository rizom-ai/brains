# Brain Definition & Instance Architecture

## Overview

The repository ships one canonical brain definition through `@rizom/brain/model`. The definition owns an ordered capability catalog and four fixed bundles. Instances own identity, bundle selection, member additions/removals, content, site/theme choices, permissions, and integration config.

Recipes are scaffold-time conveniences. They expand to explicit `brain.yaml` and are not interpreted at runtime.

## Instance directory

```text
my-brain/
├── brain.yaml
├── seed-content/
├── brain-data/
├── src/
│   ├── site.ts
│   ├── site-content.ts
│   └── theme.css
├── .env
├── .env.schema
├── package.json
└── tsconfig.json
```

`brain-data/` is durable markdown. Runtime databases and auth state live outside it.

## brain.yaml

```yaml
brain: brain
anchor: person
domain: mybrain.example.com

bundles:
  - core
  - site
  - publishing

add:
  - obsidian-vault
remove:
  - newsletter

site:
  package: "@brains/site-default"
  theme: "@rizom/theme-default"

plugins:
  directory-sync:
    seedContentPath: ./seed-content
    git:
      repo: your-org/brain-data
      authToken: ${GIT_SYNC_TOKEN}
```

The canonical definition requires explicit `bundles`. `brain: brain` may be omitted because it is the only built-in definition. Scoped external definition packages remain an advanced authoring surface.

The `model` field, when present, selects an AI text model; it does not select a brain product.

See [brain.yaml Reference](../packages/brain-cli/docs/brain-yaml-reference.md).

## Canonical definition

A definition contains:

- ordered capability and interface tuples;
- ordered bundle definitions;
- definition-owned default config and permission policy;
- optional identity/site defaults for externally authored definitions;
- eval exclusions and instructions.

```ts
import { defineBrain, defineBundle } from "@rizom/brain";

const core = defineBundle({
  id: "core",
  members: ["note", "link", "mcp"],
});

export default defineBrain({
  name: "example",
  version: "1.0.0",
  capabilities: [
    ["note", notePlugin, {}],
    ["link", linkPlugin, {}],
  ],
  interfaces: [["mcp", MCPInterface, mapMcpEnv]],
  bundles: [core],
});
```

Definition authors may use arbitrary ordered bundles over their own catalog. Canonical instances may select only the four fixed built-in bundle IDs; YAML cannot inject policy bundles.

## Fixed bundles

- `core` — identity, knowledge, auth, administration, and standard interfaces;
- `site` — site information, content, building, and analytics;
- `publishing` — long-form and distribution workflows;
- `team` — team memory, documents, and trusted collaborative writes.

Commerce is a posture, not a fifth bundle: `core + site + add: [products]`.

## Deterministic resolution

Resolution proceeds as follows:

1. validate `brain.yaml` strictly;
2. load the canonical or explicitly scoped external definition;
3. resolve selected bundles in canonical definition order;
4. compose member config, instructions, eval exclusions, and permissions;
5. apply eval exclusions, then `add`, then `remove`;
6. close all member-scoped contributions for removed members;
7. merge instance plugin and permission overrides;
8. resolve site/theme/content package references;
9. instantiate fresh plugins and interfaces;
10. produce `AppConfig`.

YAML bundle order does not change composition order. Arrays are replaced unless a typed composition rule explicitly says otherwise.

## Config callbacks

Capability callbacks receive environment and active bundle IDs:

```ts
[
  "example",
  examplePlugin,
  (env, context) => ({
    apiKey: env.EXAMPLE_API_KEY,
    siteEnabled: context.bundles.includes("site"),
  }),
];
```

No retired selection context crosses this boundary.

## Permissions

Permission contributions follow plugin, definition, bundle, then instance precedence. Principal seeds are unioned. Removed members contribute no config or policy.

Team posture grants trusted create/update for selected collaborative entity types while retaining Admin-only delete, extract, and publish.

## Environment and secrets

`.env.schema` is generated from the canonical environment declaration. Secrets remain environment-backed and may be referenced as `${NAME}` in YAML.

```dotenv
AI_API_KEY=
GIT_SYNC_TOKEN=
DISCORD_BOT_TOKEN=
```

Do not commit `.env`, auth state, private keys, or plaintext secret staging files.

## Site and theme ownership

Site structure and theme are separate:

- a site package provides layouts, routes, metadata, and optional plugin behavior;
- a theme package provides CSS;
- local `src/site.ts`, `src/site-content.ts`, and `src/theme.css` conventions layer instance authoring without forking the canonical definition.

## Creating instances

```bash
brain init my-brain --recipe minimal
brain init my-site --recipe personal
brain init my-team --recipe team
brain init my-shop --recipe commerce
```

Review the generated YAML. Runtime behavior depends on that explicit YAML, not the recipe name.

## External definitions

An explicitly scoped external package may default-export a `BrainDefinition`. This is an advanced API; it does not create aliases for retired built-in definitions and cannot make the canonical runtime interpret legacy capability IDs.

## Legacy migration

`brain config migrate` is an offline preview command for old built-in configuration. The active parser and resolver do not accept the retired contract.

Hosted desired state follows the same rule: `@rizom/ops` loads only schema version 2. Its legacy reader exists only inside offline crossover staging tooling.
