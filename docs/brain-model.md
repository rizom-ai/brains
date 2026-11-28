# Brain Definition & Instance Architecture

## Overview

The repository ships one canonical brain definition through `@rizom/brain/model`. The definition owns an ordered capability catalog, nine capability bundles, and the policy-only `team` bundle. Instances own identity, bundle selection, member additions/removals, content, site/theme choices, permissions, and integration config.

Recipes are scaffold-time conveniences. They expand to explicit `brain.yaml` and are not interpreted at runtime.

## Instance directory

`brain init` writes:

```text
my-brain/
├── brain.yaml
├── seed-content/
├── src/              # site recipes (professional, team) only
│   ├── site.tsx
│   └── theme.css
├── .env              # only when a provider key is given
├── .env.example
├── .env.schema
├── .gitignore
├── README.md
├── package.json
└── tsconfig.json
```

`--deploy` adds the deployment files listed in the [CLI Reference](../packages/brain-cli/docs/cli-reference.md#brain-init-directory).

On first start the brain creates `brain-data/`, its durable markdown, and seeds it from `seed-content/` where `plugins.directory-sync.seedContentPath` points there, as every recipe but `headless` sets. Runtime databases and auth state live outside it, under `data/`. An optional `src/site-content.ts` supplies site content definitions when `brain.yaml` sets none.

## brain.yaml

```yaml
brain: brain
bundleContract: capability-bundles-v1
anchor: person
kind: professional
domain: mybrain.example.com

bundles:
  - core
  - media
  - automation
  - web
  - chat
  - site
  - publishing
  - federation

add:
  - docs
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

The canonical definition requires explicit `bundles`. The runtime accepts a file without `brain: brain`, because it is the only built-in definition, but the generated Kamal deploy reads `brain` from `brain.yaml` and fails without it. Scoped external definition packages remain an advanced authoring surface.

The `model` field, when present, selects an AI text model; it does not select a brain product.

See [brain.yaml Reference](../packages/brain-cli/docs/brain-yaml-reference.md).

## Canonical definition

A definition contains:

- an ordered plugin catalog;
- ordered bundle definitions;
- definition-owned default config and permission policy;
- optional identity/site defaults for externally authored definitions;
- eval exclusions and instructions.

The public `@rizom/brain` shape lists configured packages, each returned by `use()`, and bundles that name those same values:

```ts
import note from "@example/note";
import link from "@example/link";
import { defineBrain, defineBundle, use } from "@rizom/brain";

const configuredNote = use(note);
const configuredLink = use(link, { captureUrls: true });

const core = defineBundle({
  id: "core",
  members: [configuredNote, configuredLink],
});

export default defineBrain({
  name: "example",
  plugins: [configuredNote, configuredLink],
  bundles: [core],
});
```

The canonical definition itself is built with the internal `@brains/app` form, which lists capability and interface tuples by catalog ID (`["note", notePlugin, config]`); that form is not part of the public API.

Definition authors may use arbitrary ordered bundles over their own catalog. Canonical instances may select only the fixed built-in bundle IDs; YAML cannot inject policy bundles.

`@rizom/brain/model` publishes the canonical definition as `CanonicalBrainDefinition` and its bundles as `CanonicalBundleDefinition`: its name, version, bundle contract, defaults and bundles. The capability and interface catalog and the site package are read by the brain itself and are not part of the public type, so a consumer compiles the entry without the runtime database or the MCP server.

## Fixed bundles

- `core` — identity, markdown knowledge, conflicts, Inbox, MCP stdio, A2A, and agent discovery;
- `media` — documents and images;
- `automation` — playbooks and onboarding;
- `web` — auth, Admin, Dashboard, Studio, and the WebDAV drive, served over HTTP;
- `chat` — platform chat, web chat and public Ask, email, notifications, conversation memory, and FAQ capture;
- `site` — site information, content, building, forms, and analytics;
- `publishing` — long-form content and distribution workflows;
- `federation` — AT Protocol publication, and references to what other brains publish;
- `matrix` — the brain's own Matrix homeserver at its domain, served over HTTP;
- `team` — policy-only shared-memory defaults and trusted collaborative writes.

Site and publishing remain independent. Optional capabilities outside every bundle are selected explicitly with `add`; the [brain.yaml Reference](../packages/brain-cli/docs/brain-yaml-reference.md#add--remove) lists them.

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

In the internal tuple form, capability config callbacks receive the environment and the active bundle IDs:

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
OPENAI_API_KEY=
GIT_SYNC_TOKEN=
DISCORD_BOT_TOKEN=
```

Do not commit `.env`, auth state, private keys, or plaintext secret staging files.

## Site and theme ownership

Site structure and theme are separate:

- a site package provides layouts, routes, metadata, and optional plugin behavior;
- a theme package provides CSS;
- local `src/site.tsx`, `src/site-content.ts`, and `src/theme.css` conventions layer instance authoring without forking the canonical definition.

## Creating instances

```bash
brain init my-brain --recipe headless
brain init my-console --recipe personal
brain init my-site --recipe professional
brain init my-team --recipe team
```

Review the generated YAML. Runtime behavior depends on that explicit YAML, not the recipe name.

## External definitions

An explicitly scoped external package may default-export a `BrainDefinition` built with `defineBrain()`; an instance selects it with `brain: "@scope/package"`. This is how external plugins reach a brain: `brain.yaml` cannot load a plugin package itself. See [External Package Authoring](./external-plugin-authoring.md). This is an advanced API; it does not create aliases for retired built-in definitions and cannot make the canonical runtime interpret legacy capability IDs.

## Legacy migration

`brain config migrate` is an offline preview command for old built-in configuration. The active parser and resolver do not accept the retired contract.

Hosted desired state follows the same rule: `@rizom/ops` loads one strict, unversioned canonical format with exact external site and theme package pins. Its temporary legacy reader exists only inside offline crossover staging tooling.
