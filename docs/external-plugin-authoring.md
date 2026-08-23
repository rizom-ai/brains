# External Package Authoring

> **Alpha preview for collaborators.** This candidate is under final API review
> and is not yet stable `0.2.0`. The last exact registry-tested combination was
> `@rizom/brain@0.2.0-alpha.313` with `@rizom/site@0.2.0-alpha.233`; the final
> candidate may advance after review. Do not widen peer ranges to stable `0.2.x`
> until the stable release is published.

Rizom extensions are declarative packages. You describe domain schemas and
behavior, default-export the resulting definition, and compose it into a Brain
with `use()`. You do not subclass a runtime plugin or work with registries,
queues, process roles, or package metadata in TypeScript.

If you are reviewing the API, start with this guide and then read the checked
[golden packages](../packages/brain-cli/test/fixtures/public-authoring/README.md).
The [stable symbol ledger](./public-release/AUTHORING_API_0.2.md) is the exact
contract reference; it is not the best introduction.

## The model in one minute

```text
extension package                        brain-definition package
-----------------                        ------------------------
default export: define*({...})  ───────▶  use(definition, config)
                                         defineBundle({ members })
                                         defineBrain({ plugins, bundles })
```

You own:

- domain IDs, schemas, behavior, and configuration;
- transport clients used by an interface;
- package dependencies and the public default export.

The runtime owns:

- installed package name/version and globally scoped capability names;
- schema parsing, registration order, rollback, and shutdown;
- entity persistence/search, durable job execution, HTTP hosting, caller
  permissions, conversations, attachments, and progress delivery.

## Choose the narrowest package family

| You want to…                                 | Import                    | Start with                                                                                                        |
| -------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Store typed content or derive another type   | `@rizom/brain/entities`   | [`defineEntity()`](../packages/brain-cli/test/fixtures/public-authoring/entity/src/index.ts)                      |
| Add tools, resources, or durable work        | `@rizom/brain/services`   | [`defineServicePlugin()`](../packages/brain-cli/test/fixtures/public-authoring/service/src/index.ts)              |
| Add Account settings, Dashboard, or Studio   | `@rizom/brain/services`   | [`operator-surface`](../packages/brain-cli/test/fixtures/public-authoring/operator-surface/src/index.ts)          |
| Add HTTP routes or a supervised event feed   | `@rizom/brain/interfaces` | [`defineInterface()`](../packages/brain-cli/test/fixtures/public-authoring/interface/src/index.ts)                |
| Connect a conversational/outbound transport  | `@rizom/brain/interfaces` | [`defineMessageInterface()`](../packages/brain-cli/test/fixtures/public-authoring/message-interface/src/index.ts) |
| Define layouts, routes, sections, and assets | `@rizom/site`             | [`defineSite()`](../packages/brain-cli/test/fixtures/public-authoring/site/src/index.tsx)                         |
| Compose packages into one Brain              | `@rizom/brain`            | [`defineBrain()`](../packages/brain-cli/test/fixtures/public-authoring/brain-definition/src/index.ts)             |

Use one family for one concern. A transport that needs durable work imports a
service job definition and enqueues it; it does not become a service/queue
hybrid. Backend behavior for a site is a separately composed plugin package.

## Ten-minute service package

This small package is the minimum complete authoring loop: schema, tool,
default export, build, and Brain composition.

### 1. Create the standalone package

```text
calendar-plugin/
├── package.json
├── tsconfig.json
└── src/
    └── index.ts
```

`package.json`:

```json
{
  "name": "@example/calendar",
  "version": "0.1.0",
  "type": "module",
  "files": ["dist"],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "check": "tsc --noEmit -p tsconfig.json",
    "build": "tsc -p tsconfig.json"
  },
  "peerDependencies": {
    "@rizom/brain": ">=0.2.0-alpha.313 <0.3.0"
  },
  "devDependencies": {
    "@rizom/brain": "0.2.0-alpha.313",
    "typescript": "^7.0.2"
  }
}
```

The peer range states host compatibility. The exact development dependency
makes local typechecking reproducible. When stable `0.2.0` exists, new packages
use `>=0.2.0 <0.3.0` for the stable patch line.

`tsconfig.json`:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "isolatedModules": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "declaration": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

### 2. Declare the capability once

`src/index.ts`:

<!-- public-authoring-example: external-calendar-service -->

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
      sideEffects: "none",
      execute: () => ({ timezone: config.timezone }),
    }),
  ],
});
```

Important details:

- import the blessed `z` from the family entry point—do not add direct `zod`;
- `config` is authored once and inferred in every callback;
- the callback returns plain schema-valid data, not a framework wrapper;
- `calendar` and `calendar-timezone` are local domain names; the runtime scopes
  them to the installed package;
- the package default is the definition object, not a constructor or factory.

Build the package with ordinary tooling:

```bash
bun install
bun run check
bun run build
bun pm pack
```

### 3. Compose it into a Brain

A separate brain-definition package imports the extension and supplies config:

<!-- public-authoring-example: external-calendar-brain -->

```ts
import calendar from "@example/calendar";
import { defineBrain, defineBundle, use } from "@rizom/brain";

const configuredCalendar = use(calendar, {
  timezone: "Europe/Amsterdam",
});

const core = defineBundle({
  id: "core",
  members: [configuredCalendar],
});

export default defineBrain({
  name: "team-calendar",
  plugins: [configuredCalendar],
  bundles: [core],
});
```

`use()` accepts the schema input (so defaults and transforms work) while plugin
callbacks receive the parsed schema output. Keep secrets in instance
configuration/environment interpolation, not in package defaults.

## How the complete reference fits together

The eight golden packages form one reading-library example:

```text
bookmark entity ──projection──▶ reading-digest entity
       │                              ▲
       └── service job ───────────────┘
               ▲
      webhook / event daemon

campfire message interface ──▶ shared conversation + agent lifecycle
reading site              ──▶ layouts + sections + static output
reader brain               ──▶ configures and bundles every package
```

Read them in this order:

1. [Entities](../packages/brain-cli/test/fixtures/public-authoring/entity/src/index.ts)
   — schemas, inferred `EntityOf`, and a definition-to-definition projection.
2. [Service](../packages/brain-cli/test/fixtures/public-authoring/service/src/index.ts)
   — parsed setup state, tools, a reusable durable job, typed entity access,
   progress, templates, and messaging.
3. [Generic interface](../packages/brain-cli/test/fixtures/public-authoring/interface/src/index.ts)
   — public/protocol routes, canonical callers, typed job enqueue, and a
   supervised event daemon.
4. [Message interface](../packages/brain-cli/test/fixtures/public-authoring/message-interface/src/index.ts)
   — channel declaration, authenticated inbound messages, lazy attachments,
   send/edit, and outbound delivery.
5. [Site](../packages/brain-cli/test/fixtures/public-authoring/site/src/index.tsx)
   — one-import layouts, routes, schema-backed content, entity display, CSS,
   head scripts, and assets.
6. [Brain definition](../packages/brain-cli/test/fixtures/public-authoring/brain-definition/src/index.ts)
   — typed `use()`, bundles, identity, and site composition.
7. [Operator surface](../packages/brain-cli/test/fixtures/public-authoring/operator-surface/src/index.ts)
   — encrypted Account settings, Dashboard semantics, Studio query state,
   catalogs, typed actions, and prepared confirmation.
8. [Account-settings interface](../packages/brain-cli/test/fixtures/public-authoring/account-settings-interface/src/index.ts)
   — the same settings contract in an interface with runtime-owned per-account
   daemon supervision.

These are standalone packages with their own manifests and TypeScript configs.
CI builds, packs, installs, imports, boots, and exercises them outside the
monorepo. If prose and fixture source disagree, the fixture is authoritative.

## Family-specific rules

### Entities

Export entity definitions when another package needs typed reads or writes.
`EntityOf<typeof definition>` includes runtime-owned fields without repeating
them. Projections reference source/target definitions and write through the
typed target helper. Persistence, markdown/frontmatter validation, visibility,
search indexing, scheduling, and loop prevention stay runtime-owned.

### Entity data, templates, and views

A declarative entity definition does **not** have a `templates` field. Entities
own storage schemas, optional Markdown encoding, and projections. Put formatting
or presentation in a separately composed service and read the entity from a job
handler:

<!-- public-authoring-example: external-template-service -->

```ts
import { bookmark } from "@example/reading-entities";
import { defineJob, defineServicePlugin, z } from "@rizom/brain/services";

const digestRequest = z.object({ bookmarkId: z.string() });
const digestResult = z.object({
  bookmarkId: z.string(),
  summary: z.string(),
});
const compileReadingDigest = defineJob({
  name: "compile-reading-digest",
  input: digestRequest,
  output: digestResult,
});

export default defineServicePlugin({
  id: "reading-insights",
  config: z.object({}),
  templates: {
    digest: {
      schema: digestResult,
      format: ({ value }) =>
        `# ${value.summary}\n\nSource bookmark: ${value.bookmarkId}`,
    },
  },
  jobs: () => [
    compileReadingDigest.handle(
      async ({ input, entities, messaging, templates }) => {
        const saved = await entities.get(bookmark, input.bookmarkId);
        if (!saved) throw new Error(`Bookmark not found: ${input.bookmarkId}`);

        const result = {
          bookmarkId: saved.id,
          summary: saved.metadata.title,
        };
        await messaging.publish({
          topic: "digest-ready",
          data: { ...result, markdown: templates.format("digest", result) },
        });
        return result;
      },
    ),
  ],
});
```

The complete checked flow is in the [reading-insights service](../packages/brain-cli/test/fixtures/public-authoring/service/src/index.ts).

Rules that are easy to miss:

- declare the render-data schema once; `format()` receives its parsed output;
- `templates.format("digest", value)` uses the service-local key and validates
  `value` before calling the formatter;
- the formatter is available to this service's tool callbacks and job handlers;
- transform an `EntityOf` value into the intended render model instead of
  coupling presentation to every persisted field;
- a `template` produces text, while a `view` supplies a web renderer;
- a template and view with the same key form one capability and must reference
  the exact same schema object;
- configuration-dependent text should be represented in the render value before
  formatting because template definitions are static.

Several unrelated concepts also use the word “template”:

| Concept                         | Meaning                                                                    |
| ------------------------------- | -------------------------------------------------------------------------- |
| Entity `markdown` codec         | Converts persisted content/metadata to and from Markdown; not presentation |
| Service `templates`             | Schema-validated text formatting available to that service                 |
| Service `views`                 | Schema-validated web rendering; may share a key/schema with a template     |
| Site route `template`           | A `namespace.section` reference created by `sectionGroup()`                |
| `@rizom/brain/templates` import | Advanced rich-rendering API outside the patch-stable `0.2` contract        |

Normal external packages should use the family fields above. Pin an exact Brain
version before deliberately using the advanced `@rizom/brain/templates`
subpath.

### Services and durable jobs

`defineJob()` is a reusable input/output contract. Bind execution inside the
owning service with `.handle()`, then import the definition from an interface or
tool and call `jobs.enqueue(job, input)`. The runtime owns retries, deadlines,
worker execution, cancellation, progress storage, restart recovery, and result
validation.

### Account settings and operator surfaces

A service or interface can declare `defineAccountSettings()`. Secret fields are
encrypted by the host and full values enter only the principal-specific
`forAccounts` callback. Dashboard and Studio callbacks receive only the current
caller's redacted settings.

A service can independently declare `defineDashboardWidget()` and
`defineStudioWorkspace()`. Both return schema-validated semantic data: authors do
not provide React components, HTML, CSS, scripts, renderer names, or browser bundles.
Use `DashboardOperatorView` blocks for Dashboard data and `StudioWorkspaceView`
blocks for authenticated Studio operations. Studio-only capabilities include:

- a Zod query schema read through `query.get(schema)`, with the host owning URL
  parsing and controls; the schema must accept `{}` and provide its initial
  defaults so the workspace has a canonical base URL state;
- immutable caller-filtered action and entity catalogs;
- bounded host-rendered plain text for authenticated source detail;
- semantic view heads and status plus bounded `card` groups and primary/aside
  `columns`; cards contain panels, columns contain panels or cards, and nested
  containers are rejected;
- typed `defineWorkspaceAction()` inputs/outputs and permission floors;
- static confirmation text or prepared confirmation bound to caller, action,
  input, revision, expiry, and one use; and
- closed external, entity, Account, Admin, Inbox, Publishing, and Site launch
  intents resolved by the host, including Inbox detail, Chat discussion, and
  note-capture handoffs without author-supplied URLs.

Widgets and workspaces do not reference or discover each other. A missing
optional host is a true no-op, and execution-only workers do not bind operator
callbacks. See the checked [operator fixture](../packages/brain-cli/test/fixtures/public-authoring/operator-surface/src/index.ts)
for a complete cast-free package and its [capability inventory](../packages/brain-cli/test/fixtures/public-authoring/operator-surface/CAPABILITY_INVENTORY.md)
for the built-in equivalence evidence. The local packed operator consumer also
checks the additive card/columns type exports; exact registry evidence covers
their first published release in `@rizom/brain@0.2.0-alpha.313`.

### Generic interfaces

Use `{ kind: "public" }` only for genuinely unauthenticated routes. For a
protocol-authenticated route, `protocol({ authenticate })` returns the external
identity or `null`; the runtime derives the canonical actor, permission, and
Anchor status supplied as `caller`.

Long-lived listeners are `defineDaemon()` tasks. Respect `signal`, emit
`health.ready()` only when usable, and report degraded-but-running states with
`health.warning()`. Daemons run in the web process; imported durable jobs run in
workers.

### Message interfaces

Declare the channel and recipient schema once. A conversational listener calls
`messages.receiveAuthenticated()` with normalized sender/channel/text and a
lazy attachment function. Implement `send` and optional `edit`; implement
`deliver` for manual outbound delivery. Conversation mapping, permissions,
confirmation routing, attachment policy, progress, and shutdown are not
transport responsibilities.

### Sites

Site authors import only `@rizom/site` (plus React for JSX). The structural
definition never embeds a runtime plugin. See [External Site and Theme
Authoring](./external-site-authoring.md) for package metadata and the full site
example.

## Packaging checklist

Before publishing an external package:

- default-export exactly one canonical `define*` result;
- publish built JavaScript and declarations through `exports`;
- declare the first compatible Brain version as a peer lower bound and use an
  exact development version;
- keep ordinary transport/domain libraries in `dependencies`;
- import only public `@rizom/*` entry points—never private `@brains/*`;
- do not import a package manifest or repeat package name/version in source;
- do not add direct `zod`, runtime classes, registries, queue types, shell
  objects, or process-role branches;
- pack and install the tarball in a clean consumer before publishing.

## Common mistakes

| Symptom                                               | Correction                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Config is typed as optional after declaring a default | Use callback `config`; it is inferred as parsed `z.output`, while `use()` accepts `z.input` |
| Tool/job/entity names include a package prefix        | Use local domain names; runtime scoping adds the installed package identity                 |
| An interface manually constructs permission facts     | Return the authenticated transport identity and use the runtime-supplied `caller`           |
| A listener never shuts down                           | Subscribe cleanup to the supplied `AbortSignal`                                             |
| Durable work runs inside an HTTP handler              | Import a `defineJob()` contract and enqueue it                                              |
| A widget or workspace returns JSX, HTML, or a URL     | Return a closed semantic view and typed host launch intent                                  |
| Studio filters are parsed manually                    | Declare a query schema and read it with `query.get(schema)`                                 |
| A site needs backend behavior                         | Compose a separate focused plugin package; do not put `plugin` in `defineSite()`            |
| Types leak `@brains/*` in generated declarations      | Replace private types with public family contracts before publishing                        |

## Removed alpha shapes

Stable `0.2.x` does not load plugin subclasses, tuple factories, default plugin
functions, named `plugin` factories, or `brain.yaml` package declarations. Move
package imports into a brain-definition package and compose default definitions
with `use()`. The [alpha migration guide](./public-release/AUTHORING_0.2_MIGRATION.md)
lists every corrected signature.

## Where to give feedback

For pre-release review, focus on author experience rather than internal
implementation:

- Is the right family obvious?
- Is any runtime bookkeeping leaking into domain source?
- Does schema/config inference behave as expected?
- Is a common capability missing from the declarative model?
- Would you be comfortable maintaining the package through the `0.2.x` line?
