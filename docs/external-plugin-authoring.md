# External Package Authoring

> **Current-tree preview for collaborators, not a registry release guide.**
> These examples target a tarball built from this reviewed checkout. The local
> Brain package version is `0.2.0-alpha.357`; that version string alone is not
> evidence for a registry artifact. The historical registry baseline
> (`alpha.313` with Site `alpha.233`) predates these breaking APIs and has no
> testing entry. Do not install it for the examples below. Stable `0.2.0` and
> verified first-containing-release peer ranges remain separate nomination gates.

Breaking alpha cleanup is allowed before stable `0.2.0`. Only after that release
does the `0.2.x` patch-compatibility promise apply; breaking the frozen contract
then requires a later minor release.

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
| Add tools, resources, or durable work        | `@rizom/brain/services`   | [`defineServicePlugin()`](../packages/brain-cli/test/fixtures/public-authoring/service/src/index.tsx)             |
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

First obtain a tarball built from this checkout. From the repository root:

```bash
mkdir -p /tmp/rizom-authoring
(cd packages/brain-cli && bun run build && bun pm pack --destination /tmp/rizom-authoring --quiet)
```

Copy the resulting Brain `.tgz` next to your standalone package directory as
`rizom-brain.tgz`. The development dependency below uses that file, not npm.
If reviewing another checkout, use its package version for the exact peer pin.

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
    "@rizom/brain": "0.2.0-alpha.357"
  },
  "devDependencies": {
    "@rizom/brain": "file:../rizom-brain.tgz",
    "typescript": "^7.0.2"
  }
}
```

The peer pin here describes the local candidate only. Keep the tarball and
revision together for reproducibility; it is not a claim about an identically
versioned npm artifact. Before publishing your package, test against the actual
published candidate and set its verified peer range. Do not reuse historical
alpha floors or claim stable `0.2.x` support before nomination.

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

- a definition is two objects: what the package **is** — its id, its config,
  what `setup` builds — and what it **does** with that. The split is the
  same one a brain makes when it boots: a package is configured and set up
  before anything asks it for a tool or a route. It is also what lets every
  behavior slot read `state` as the type `setup` returned, in any order; in
  one object, a slot written above `setup` would see an empty state and say
  nothing;
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

### Entity data and presentation

Presentation that belongs to a type lives with the type. A declarative entity
definition takes a `templates` field, and the shipped `blog` and `doc`
packages use it: how a post reads as a page is a fact about posts, and putting
it elsewhere means two packages have to agree about one thing.

Presentation that spans types, or that a brain configures rather than a package
fixing, belongs to a service. A digest of several bookmarks is not a fact about
any one bookmark; a site's section list is the brain's, not a package's. Read
the entity from a job handler and format it there:

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
    jobs: () => [
      compileReadingDigest.handle(
        async ({ input, entities, messaging, templates }) => {
          const saved = await entities.get(bookmark, input.bookmarkId);
          if (!saved)
            throw new Error(`Bookmark not found: ${input.bookmarkId}`);

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
  },
);
```

The complete checked flow is in the [reading-insights service](../packages/brain-cli/test/fixtures/public-authoring/service/src/index.tsx).

Rules that are easy to miss:

- declare the render-data schema once; `format()` receives its parsed output;
- `templates.format("digest", value)` uses the service-local key and validates
  `value` before calling the formatter;
- the formatter is available to this service's tool callbacks and job handlers;
- transform an `EntityOf` value into the intended render model instead of
  coupling presentation to every persisted field;
- one `templates` entry declares its schema and optional `format` and `render`
  behavior; text and web presentation share that declaration, not separate
  template/view maps;
- configuration-dependent text should be represented in the render value before
  formatting because template definitions are static.

Several unrelated concepts also use the word “template”:

| Concept                         | Meaning                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| Entity `markdown` codec         | Converts persisted content/metadata to and from Markdown; not presentation             |
| Service `templates`             | One declaration per template: schema-validated text formatting, web rendering, or both |
| Site route `template`           | A `namespace.section` reference created by `sectionGroup()`                            |
| `@rizom/brain/templates` import | Advanced rich-rendering API outside the patch-stable `0.2` contract                    |

Normal external packages should use the family fields above. Pin an exact Brain
version before deliberately using the advanced `@rizom/brain/templates`
subpath.

### Testing a package

`@rizom/brain/testing` runs a package without a brain. Install what the
package exports, seed the records it reads, and call the tools it declared:

<!-- public-authoring-example: external-package-test -->

```ts
import { createBrainTestHarness } from "@rizom/brain/testing";

export async function greetsInTheConfiguredZone(
  calendar: unknown,
): Promise<string | undefined> {
  const harness = createBrainTestHarness();
  try {
    const installed = await harness.installPackage(calendar, {
      timezone: "UTC",
    });
    const answer = await installed.tools[0]?.call({});
    return answer?.ok &&
      typeof answer.data === "object" &&
      answer.data !== null &&
      "timezone" in answer.data
      ? String(answer.data.timezone)
      : undefined;
  } finally {
    await harness.reset();
  }
}
```

Tools return `{ ok: true, data }`, `{ ok: false, error, code }`, or
`{ ok: false, confirmation }` when approval is pending. Check
`"confirmation" in answer` before treating an incomplete call as an error.
The confirmation includes `toolName`, `summary`, and `args`; replay those args
with the named tool to approve. The runtime executes the prepared input described
by the summary without rerunning its transforms or generated defaults. Tokens
are bounded, expire, and are consumed even by a tampered replay. The harness
applies the same tool permission rule as production: callers default to admin,
and `call(input, { permission: "public" })` cannot execute an admin-only tool.

For a typed bus request, pass the shared `{ topic, payload, response }` schema contract to
`harness.request(contract, input)`. It returns parsed `{ ok: true, data }` or
`{ ok: false, code }`, using the shared `SdkErrorCode` vocabulary below.
Author contexts exposing
`messaging.request` accept the same contract. Providers validate wire responses;
typed callers parse those wire values, so transforms are not applied to already
transformed data. Bare `request({ type, payload })` returns an untyped bus
envelope; it does not promise a result schema. A `defineSubscription()` with a
response schema checks the handler's return against that schema's **input**
type and retains the response schema, so its result can also be passed directly
to `request(subscription, input)`. Notifications without a response schema do
not promise a typed answer. Subscription entity access is read-only in both the
public type and the object handed to the handler.

Inline route, tool, and subscription handlers infer literal/enum and
discriminated-union answers without `as const` or return annotations. Immutable
arrays and tuples are accepted as schema inputs; wrong literals, missing fields,
and transformed outputs supplied in place of inputs are still rejected. An
already-extracted function keeps its own declared/inferred return type—the
helper does not narrow a `string` that the function previously widened.

Install dependencies before calling `finalizeRegistration()`; it runs every
installed package's registration-complete hooks in installation order. Use
`try/finally` to `await harness.reset()` even when an assertion fails. Reset
shuts down installed packages in reverse order and removes their routes. Failed
registration rolls back acquired resources immediately, including earlier
children of a failed compound-package install. Previously installed packages
remain usable, and the failed package can be retried without resetting the
brain. Cleanup errors are reported only after all registered cleanup callbacks
have been attempted.

For a profile-aware package, use
`createBrainTestHarness({ profileKind: "professional" })` and install the package
that declares that kind before finalization. An unregistered selection fails at
`finalizeRegistration()`, as it does during boot. Omitting the option keeps the
base profile with no selected kind.

`installed.jobs` lists registered jobs with a `run(input)` method. It validates
and runs one handler attempt in-process; it does not simulate durable queue
retries, deadlines, or terminal hooks. `harness.formatTemplate(name, value)`
validates and formats a registered text template, while `harness.fetch()`
exercises declared routes with their authentication and schema validation.
The harness hands back names and answers rather than runtime objects, which is
why nothing here imports `@brains/*`.

### Reader capabilities

Author callback readers expose their declared methods, not the underlying runtime
services. Job uploads support `read`; attachment readers support `resolve`.
Ordinary permission checks do not expose principal replacement, and profile
selection readers do not register kinds. Interface-owned upload writers keep their
explicit save/remove API. Their namespace must remain one flat path segment.

Scoped state and upload handles hide implementation fields behind bound facades.
This prevents changing a handle's scope through hidden options and allows detached
method calls without losing the receiver. It is API capability hygiene, not a
sandbox for plugin JavaScript. Callback loggers and their child loggers likewise
expose only the declared logging methods, not file handles or singleton controls.
Job progress exposes only `report`; heartbeat timers and reporter construction
remain runtime responsibilities. Jobs that read a selected profile definition get
its validated metadata and declared fields schema, not extra registration fields.
Auth lookups likewise return only the requested caller, audit, federation, identity,
or administration methods—not the underlying service or its shutdown controls.
These are bound views, not a new permission policy: explicitly declared
administration and federation commands remain available.

Protocol interfaces receive the declared MCP transport operations, not the runtime
registration service. The returned MCP SDK server is intentionally available for
connecting and managing transports. Configured `spaces` are frozen snapshots.
Projection selection likewise receives entity/conversation readers and a space
snapshot; derivation receives only its declared AI operations and logger, not the
underlying runtime services.

Entity-type policy and attachment-provider metadata are validated snapshots.
Metadata reads return detached, locally editable copies: changing a returned
publish-status list, search weight, or attachment target does not alter registry
policy. Undeclared implementation fields are not included.

Package-owned state keeps the existing keys for ordinary `@scope/name` packages.
Unscoped names and scoped names containing dots now use separate owner encodings,
so names such as `@scope/pkg` and `scope.pkg` no longer share state. If an older
installation used those ambiguous names, review ownership before migrating its
stored rows; the runtime does not guess ownership or fall back to shared keys.

Every interface state namespace includes package and declaration identity, so
two packages using the same interface ID stay separate, including for undotted
local names. Interface keys also cannot overlap package-owned state.
This alpha correction does not migrate, read, or delete old declaration-only
rows. Existing Discord/Slack thread-following and mention-routing settings start
fresh; chat history is unchanged.

Temporary upload directories likewise include package, interface ID, and local
namespace identity, using a fixed-length digest to stay within filesystem limits.
Reference shapes and route URLs are unchanged, but this alpha upgrade intentionally
stops resolving uploads stored under the old declaration-only directories.
Re-upload a temporary attachment if needed. There is no migration or fallback;
old directories remain untouched and are not pruned by the new scopes. Images
already preserved as entities retain their embedded bytes.

### Coded failures

`SdkError`, `sdkErrorCodeSchema`, `sdkErrorSchema`, `SdkErrorCode`, and
`SdkErrorData` are available from the services, interfaces, entities, and testing
entries. The shared codes are `no_handler`, `handler_failed`, `invalid_input`,
`invalid_response`, `unauthenticated`, `permission_denied`, `not_found`,
`conflict`, `cancelled`, and `deadline_exceeded`.

Branch on `code`, not message text or `instanceof`: separate package copies and
serialized failures need not share a prototype. `sdkErrorSchema` validates the
canonical `{ code, message }` data. Existing tool/request/HTTP envelopes retain
their own shape while carrying the same code.

<!-- public-authoring-example: external-coded-failure -->

```ts
import { SdkError } from "@rizom/brain/services";

throw new SdkError("not_found");
```

An optional `{ message, cause }` constructor argument is for **local diagnostics**.
Runtime mappings and `JSON.stringify(error)` emit only a safe public message
and the code, never arbitrary diagnostic text, stacks, causes, or private request
data. For a known application refusal, explicitly opt into a bounded (maximum
1024 characters) `publicMessage`, for example
`new SdkError("conflict", { publicMessage: "Refresh your selection" })`.
Do not populate it from raw provider errors; `message` and `cause` stay local. Unclassified handler failures and unknown handler codes fall back
to `handler_failed`; validation boundaries identify invalid input or output.

Runtime-generated declared-route failures return `{ error, code }`: invalid
input is HTTP 400, missing authentication 401, denied permission 403, missing
resources 404, cancellation 408, state conflicts 409, unavailable handlers 503,
and deadlines 504.
Handler/output failures use 500. Explicit protocol `Response` values keep their
own bodies, status codes, and headers. Typed tools can return a schema-valid
business refusal as successful `data`; this is distinct from throwing a failure.
Declared jobs likewise complete with any schema-valid output, including
`{ success: false, error: "Inventory is empty" }`. Throw `SdkError` to fail an
attempt. Native worker handlers retain their explicit controlled-failure protocol;
the declarative adapter selects data semantics without adding an authoring option.
Explicit native/protocol tool refusals retain their deliberate messages too;
runtime exception handlers must sanitize before producing their envelopes.

Durable service/operator job status exposes `error` and `code`; interface status
uses `lastError` and `code`. Codes survive queue restarts. The runtime sanitizes
old rows without codes and unknown stored codes when serving these public
readers. Failed rows with no stored error information still report `handler_failed`.
Batch status and batch progress `errors` are arrays of shared `{ code, message }`
records, not diagnostic strings. Missing children report `not_found`; old or
unknown child codes fall back safely. Batch coordination itself remains in memory;
this does not promise that batch metadata survives a runtime restart.
Terminal hooks receive coded errors only after input has been parsed, and reuse
the attempt's prepared input rather than rerunning transforms or defaults.
Corrupt stored inputs cannot be handed to a callback promising valid typed input.
The public single-attempt job runner throws coded failures but does not simulate
worker retries, deadlines, or terminal hooks.

The former message-only code names and `RuntimeUploadStoreError` family have
been consolidated, not retained as compatibility aliases. Invalid upload refs
use `invalid_input`, unreadable/invalid upload data uses `invalid_response`, and
missing uploads use `not_found`.

### Services and durable jobs

`defineJob()` is a reusable input/output contract. Bind execution inside the
owning service with `.handle()`, then import the definition from an interface or
tool and call `jobs.enqueue(job, input)`. The runtime owns retries, deadlines,
worker execution, cancellation, progress storage, restart recovery, and result
validation. Inputs and outputs must be JSON wire values accepted by their
schemas; the queue retains those wire values and parses them at execution/read
boundaries. An input transform is not a new enqueue payload. Retry and
`oncePending` policies come from the registered job regardless of which family
enqueues it. Batch children retain their retry policy, but a batch refuses jobs
with `oncePending`: sharing a child across roots cannot preserve batch
completion/progress ownership. Validation finishes before any child is queued.

Service, generic-interface and message-interface setup may be async. Return the
shared client/state and register its release with `lifecycle.onCleanup()`.
Declaration callbacks receive the resolved state, independently per instance.

Durable `runtimeState({ namespace, schema })` stores are separate from setup's
in-memory return value. `set()` and `setIfNotExists()` accept the schema's input
type; `get()` and `list()` return its parsed output. Storage retains validated
JSON wire inputs, not transformed values. For `z.string().transform(Number)`,
write `"7"` and read `7`. Validation checks the JSON round trip before writing;
values that cannot be read through the schema after serialization are refused.
The same rule applies to reaction/tool `state()` stores.

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
checks the additive card/columns type exports. Earlier registry evidence for
those exports does not establish compatibility for the current definition APIs;
these fixtures now target the current-tree tarball.

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
