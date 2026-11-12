# External Package Authoring

Rizom extensions are declarative packages. You describe domain schemas and
behavior, default-export the resulting definition, and compose it into a Brain
with `use()`. You do not subclass a runtime plugin or work with registries,
queues, process roles, or package metadata in TypeScript.

For one package end to end, start with the [Package Quickstart](./package-quickstart.md).
This guide covers every package family. The checked
[golden packages](../packages/brain-cli/test/fixtures/public-authoring/README.md)
are complete reference source, and the [public API ledger](./public-release/AUTHORING_API_0.2.md)
states every stable contract and the rules the families share.

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
| Add tools, resources, or durable work        | `@rizom/brain/services`   | [`defineServicePlugin()`](../packages/brain-cli/test/fixtures/public-authoring/service/src/index.tsx)             |
| Add Account settings, Dashboard, or Studio   | `@rizom/brain/services`   | [`operator-surface`](../packages/brain-cli/test/fixtures/public-authoring/operator-surface/src/index.ts)          |
| Add HTTP routes or a supervised event feed   | `@rizom/brain/interfaces` | [`defineInterface()`](../packages/brain-cli/test/fixtures/public-authoring/interface/src/index.ts)                |
| Connect a conversational/outbound transport  | `@rizom/brain/interfaces` | [`defineMessageInterface()`](../packages/brain-cli/test/fixtures/public-authoring/message-interface/src/index.ts) |
| Define layouts, routes, sections, and assets | `@rizom/site`             | [`defineSite()`](../packages/brain-cli/test/fixtures/public-authoring/site/src/index.tsx)                         |
| Compose packages into one Brain              | `@rizom/brain`            | [`defineBrain()`](../packages/brain-cli/test/fixtures/public-authoring/brain-definition/src/index.ts)             |
| Test a package on the runtime                | `@rizom/brain/testing`    | [`startTestBrain()`](../packages/brain-cli/test/fixtures/public-authoring/reminders/test/reminders.exercise.ts)   |

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
    "@rizom/brain": ">=0.2.0 <0.3.0"
  },
  "devDependencies": {
    "@rizom/brain": "0.2.0",
    "typescript": "^7.0.2"
  }
}
```

The peer range is the brains the package runs on; the exact development
dependency is the one it is built and tested against. Before `0.2.0` is
published, use the exact alpha you develop against for both.

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

export default defineServicePlugin(
  {
    id: "calendar",
    config: z.object({
      timezone: z.string().default("UTC"),
    }),
  },
  {
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
  },
);
```

Important details:

- import the blessed `z` from the family entry point—do not add direct `zod`;
- the first argument says what the package is (`id`, `config`, and a `setup`
  when it holds state); the second says what it does;
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

The golden packages form one reading-library example:

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
2. [Service](../packages/brain-cli/test/fixtures/public-authoring/service/src/index.tsx)
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
9. [Profile steward](../packages/brain-cli/test/fixtures/public-authoring/profile-steward/src/index.ts)
   — the one package that writes the reader profile, and the contract it
   answers for changes.
10. [Profile import](../packages/brain-cli/test/fixtures/public-authoring/profile-import/src/index.ts)
    — an importer that asks the steward through its contract instead of
    writing the profile itself.
11. [Reminders](../packages/brain-cli/test/fixtures/public-authoring/reminders/src/index.ts)
    — one service end to end, with [its own test](../packages/brain-cli/test/fixtures/public-authoring/reminders/test/reminders.exercise.ts)
    on `@rizom/brain/testing`.

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

### Entity data and templates

An entity type can declare presentation `templates` and a `feed` of its own;
the entity fixture's
[presentation canary](../packages/brain-cli/test/fixtures/public-authoring/entity/src/presentation-type-canary.ts)
shows both. Formatting that a service's work produces belongs in that service's
`templates`, and the service reads the entity from a job:

<!-- public-authoring-example: external-template-service -->

```ts
import { bookmark } from "@example/reading-entities";
import {
  defineChannel,
  defineJob,
  defineServicePlugin,
  z,
  type EntityReader,
} from "@rizom/brain/services";

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
// The event the job announces, its payload typed by the channel.
const digestReady = defineChannel(
  "@example/reading-insights:digest-ready",
  digestResult.extend({ markdown: z.string() }),
);

// A helper written outside the `jobs` slot is handed the slot's `entities`.
async function summarize(
  entities: EntityReader,
  bookmarkId: string,
): Promise<z.output<typeof digestResult>> {
  const saved = await entities.get(bookmark, bookmarkId);
  if (!saved) throw new Error(`Bookmark not found: ${bookmarkId}`);
  return { bookmarkId: saved.id, summary: saved.metadata.title };
}

export default defineServicePlugin(
  { id: "reading-insights", config: z.object({}) },
  {
    templates: {
      digest: {
        schema: digestResult,
        format: ({ value }) =>
          `# ${value.summary}\n\nSource bookmark: ${value.bookmarkId}`,
      },
    },
    // The slot carries the capabilities; the handler is given the call's data.
    jobs: ({ entities, messaging, templates }) => [
      compileReadingDigest.handle(async ({ input }) => {
        const result = await summarize(entities, input.bookmarkId);
        await messaging.publish(digestReady, {
          ...result,
          markdown: templates.format("digest", result),
        });
        return result;
      }),
    ],
  },
);
```

The complete checked flow is in the [reading-insights service](../packages/brain-cli/test/fixtures/public-authoring/service/src/index.tsx).

Rules that are easy to miss:

- declare the render-data schema once; `format()` receives its parsed output;
- `templates.format("digest", value)` uses the service-local key and validates
  `value` before calling the formatter;
- the formatter is the `tools` and `jobs` slots' `templates`;
- transform an `EntityOf` value into the intended render model instead of
  coupling presentation to every persisted field;
- one template formats a value as text (`format`), renders it
  (`renderers.web`), or both; it renders only a schema that produces JSON;
- configuration-dependent text should be represented in the render value before
  formatting because template definitions are static.

Several unrelated concepts also use the word “template”:

| Concept                 | Meaning                                                                    |
| ----------------------- | -------------------------------------------------------------------------- |
| Entity `markdown` codec | Converts persisted content/metadata to and from Markdown; not presentation |
| Entity `templates`      | Presentation an entity type declares, scoped to the type                   |
| Service `templates`     | Schema-validated text formatting and web rendering for that service        |
| Site route `template`   | A `namespace:section` reference created by `sectionGroup()`                |

### Services and durable jobs

`defineJob()` is a reusable input/output contract. Bind execution inside the
owning service with `.handle()`, then import the definition from an interface or
tool and call `jobs.enqueue(job, input)`. The runtime owns retries, deadlines,
worker execution, cancellation, progress storage, restart recovery, and result
validation.

The `jobs` and `tools` slots are given one `entities`, which reads and writes
as the current caller. Inside a running job that is whoever started it: the
tool's caller, the Studio or Dashboard viewer, or the caller of an interface
route. A job another package enqueued outside a request, such as from a daemon,
reads and writes with that package's own grant, which is public unless the
brain grants more. A job the service queued for itself, like an answer to
another package, runs as the service: its own types are its to read at every
visibility and to write past the action policy, which governs callers. If the
requester's account is revoked before the job runs, the job fails. A service
writes only the entity types its header's `entities` declares.

### Failures

Throw `new SdkError(code, { message, publicMessage })` for a failure the caller
should be told about. The caller gets the `code` and the `publicMessage`, or
the code's standard message: a tool answers `{ success: false, code, error }`,
a job's status carries the code, and a route answers `{ error, code }` with the
HTTP status the code names. The message stays in the brain's logs. Any other
thrown error reaches the caller as `handler_failed`.

### Contracts and stewardship

Packages talk over the message bus by contract. `defineBusContract()` declares
a request one package answers or a command every package hears; the package
exports it for the packages that ask. The owner answers in its `subscriptions`
slot with `answer(contract, handler)`, on a channel its package name owns
(`<package name>:<name>`), and an asker calls `messaging.request(contract,
request)` and reads a `BusResult`.

A package stewards the entity types its header owns: it alone writes them.
Another package that needs one changed asks the steward through a contract the
steward answers, and the steward decides by the request's `sender`. The
[profile steward](../packages/brain-cli/test/fixtures/public-authoring/profile-steward/src/index.ts)
and [importer](../packages/brain-cli/test/fixtures/public-authoring/profile-import/src/index.ts)
fixtures show both sides.

### Account settings and operator surfaces

A service or interface can declare `defineAccountSettings()`. Secret fields are
encrypted by the host; full values enter the principal-specific `forAccounts`
callback, and a service's own `accountSettings.read()` with each secret sealed.
Dashboard and Studio callbacks receive the current caller's redacted `settings`
for view data. When a server-side call needs the
full value, `accountSettings.read()` returns the caller's own settings with each
secret sealed: `reveal()` gives the value, and serialized, printed or
interpolated it is `[secret]`.

A service can independently declare `defineDashboardWidget()` and
`defineStudioWorkspace()`. Both return schema-validated semantic data: authors do
not provide React components, HTML, CSS, scripts, renderer names, or browser bundles.
Use `DashboardOperatorView` blocks for Dashboard data and `StudioWorkspaceView`
blocks for authenticated Studio operations. Studio-only capabilities include:

- a Zod query schema read through `query.get(schema)`, with the host owning URL
  parsing and controls; the schema must accept `{}` and provide its initial
  defaults so the workspace has a canonical base URL state;
- immutable caller-filtered action and entity catalogs;
- `publishesEntityTypes: true`, which makes the workspace the target of the
  Studio editor's publication actions for the entity types it covers; it
  requires entities or an entity catalog and the `queue`, `remove`, `retry`,
  `reorder`, and `publish` actions;
- bounded host-rendered plain text for authenticated source detail;
- semantic view heads and status plus bounded `card` groups and primary/aside
  `columns`; cards contain panels, columns contain panels or cards, and nested
  containers are rejected;
- typed `defineWorkspaceAction()` inputs/outputs and permission floors; an
  action's `execute` writes the service's own entity types through its
  `entities`, as the operator who invoked it and held to the action policy,
  while loaders read at the caller's visibility;
- a launch action, `launch: { origins }`, whose `execute` answers `{ url }`:
  Studio sends the operator's browser there once the runtime has checked it is
  an absolute https URL on a declared origin; with `accountSettings.claim()`
  it starts a consent flow whose `protocol` callback route redeems the claim
  and, declared with `returnTo: workspace`, answers the workspace's query input
  so the runtime sends the browser back there;
- static confirmation text or prepared confirmation bound to caller, action,
  input, revision, expiry, and one use; and
- closed external, entity, Account, Admin, Inbox, Publishing, Site, and Traffic launch
  intents resolved by the host, including Inbox detail, Chat discussion, and
  note-capture handoffs without author-supplied URLs.

Widgets and workspaces do not reference or discover each other. A missing
optional host is a true no-op, and execution-only workers do not bind operator
callbacks. See the checked [operator fixture](../packages/brain-cli/test/fixtures/public-authoring/operator-surface/src/index.ts)
for a complete cast-free package and its [capability inventory](../packages/brain-cli/test/fixtures/public-authoring/operator-surface/CAPABILITY_INVENTORY.md)
for the built-in operator surfaces each contract covers.

### Generic interfaces

`defineInterface(header, behavior)` takes two arguments, as a service does: the
header names the interface, its config and account settings, and its `setup`;
the behavior's `routes` and `daemons` read the `state` setup returns. Setup is
given `runtimeState`, kept under the owning package.

Use `{ kind: "public" }` only for genuinely unauthenticated routes. For a
protocol-authenticated route, `protocol({ authenticate })` returns the external
identity or `null`; the runtime derives the canonical actor, permission, and
Anchor status supplied as `caller`.

Long-lived listeners are `defineDaemon()` tasks. Respect `signal`, emit
`health.ready()` only when usable, and report degraded-but-running states with
`health.warning()`. Daemons run in the web process; imported durable jobs run in
workers.

### Message interfaces

`defineMessageInterface(header, behavior)` takes two arguments too: the channel
and `setup` belong to the header, and `listen`, `send`, `edit`, `deliver` and
`daemons` to the behavior. A package that runs several message interfaces from one
config declares them with `defineMessageInterfacePackage()`. Declare the channel and
recipient schema once. A conversational listener calls
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

## Testing a package

`@rizom/brain/testing` runs a package's own tests on the runtime itself.
`startTestBrain({ plugins: [use(definition)] })` starts a brain in the test's
process, on the runtime's own services and a temporary storage of its own, and
runs the packages under the name the working directory's `package.json` gives
them. The brain calls tools as `brain tool` does, asks contracts, serves the
packages' routes, reads what they stored, and waits for queued jobs. It calls
tools only as the operator, an admin, asks contracts only as the brain itself,
and reaches no AI provider. The [Package Quickstart](./package-quickstart.md)
shows a complete test, and the
[reminders test](../packages/brain-cli/test/fixtures/public-authoring/reminders/test/reminders.exercise.ts)
drives a tool, a contract, a route and a job together.

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
- run the package's own tests with `@rizom/brain/testing`;
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
