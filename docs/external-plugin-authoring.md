# External Package Authoring

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

## Which version to use

These examples target a tarball built from this reviewed checkout, not a
published registry release. A matching version string alone does not prove a
registry artifact contains this API. The historical `alpha.313`/Site `alpha.233`
baseline predates these APIs and has no testing entry: do not install it for
these examples. Stable `0.2.0` and verified peer ranges remain separate release
gates. For an existing package, read the
[alpha migration guide](./public-release/AUTHORING_0.2_MIGRATION.md).

## Choose the narrowest package family

| You want to…                                   | Import                                            | Start with                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Store typed content or derive another type     | `@rizom/brain/entities`                           | [`defineEntity()`](../packages/brain-cli/test/fixtures/public-authoring/entity/src/index.ts)                      |
| Store a type and write it from your tools/jobs | `@rizom/brain/entities` + `@rizom/brain/services` | `defineEntity()`, then `entities: [definition]` on the `defineServicePlugin()` header                             |
| Add tools, resources, or durable work          | `@rizom/brain/services`                           | [`defineServicePlugin()`](../packages/brain-cli/test/fixtures/public-authoring/service/src/index.tsx)             |
| Add Account settings, Dashboard, or Studio     | `@rizom/brain/services`                           | [`operator-surface`](../packages/brain-cli/test/fixtures/public-authoring/operator-surface/src/index.ts)          |
| Add HTTP routes or a supervised event feed     | `@rizom/brain/interfaces`                         | [`defineInterface()`](../packages/brain-cli/test/fixtures/public-authoring/interface/src/index.ts)                |
| Connect a conversational/outbound transport    | `@rizom/brain/interfaces`                         | [`defineMessageInterface()`](../packages/brain-cli/test/fixtures/public-authoring/message-interface/src/index.ts) |
| Define layouts, routes, sections, and assets   | `@rizom/site`                                     | [`defineSite()`](../packages/brain-cli/test/fixtures/public-authoring/site/src/index.tsx)                         |
| Compose packages into one Brain                | `@rizom/brain`                                    | [`defineBrain()`](../packages/brain-cli/test/fixtures/public-authoring/brain-definition/src/index.ts)             |

Use one family for one concern. A transport that needs durable work imports a
service job definition and enqueues it; it does not become a service/queue
hybrid. Backend behavior for a site is a separately composed plugin package.

If your package both stores and writes a type, declare that type in the service's
**first argument**: `defineServicePlugin({ id, config, entities: [reminder] }, { tools, jobs })`.
That header establishes write ownership; installing a separate entity package
alongside a service does not grant the service permission to write it. Use
`defineEntityPackage()` for content other packages read or derive by projection.
The [reading service fixture](../packages/brain-cli/test/fixtures/public-authoring/service/src/index.tsx)
records its own `readingRequest` type this way while reading bookmarks owned by
another package.

`stewards: ["entity-type"]` is a separate service-header claim for an existing,
eligible **shell-owned** type, such as profile singletons. It does not register a
type or grant permission to write another plugin's type. Only one service may
claim stewardship; unsupported or conflicting claims fail registration.

Entity `metadata` describes canonical **stored values**, not an input conversion
pipeline. For example, a tool input may convert a priority string to a number;
the entity metadata then declares `priority: z.number()`. Defaults and safe
coercions such as `z.coerce.number()` are supported: their output can be read and
validated again without changing meaning. Default values must satisfy the
canonical schema, and refinements must be pure validation.

`defineEntity()` rejects transformations nested anywhere in metadata, including
`.transform()`, `.preprocess()`, `.pipe()`, codecs, `.overwrite()`, and string
trim/case-conversion checks. Move these to tool/job/request input schemas or an
explicit import decoder. This conservative rule does not try to guess whether
an arbitrary callback is idempotent. Declared `metadataFrom` migrations remain
separate and must leave already-current metadata unchanged.

Tools, service jobs, and subscriptions use the same `entities` API:

- `get(reminder, id)`, `list(reminder, options)`, and `search(reminder, query, options)` infer metadata from the definition. `get` returns `null` when absent.
- `create(reminder, { content, metadata })` and `update(reminder, entity)` return `{ id }`. Update a retrieved entity, preserving its other fields.
- Writes require the service to own or steward the type. Interfaces can read entities but cannot write them.

Import `EntityAccess` for an extracted helper shared by these handlers, or
`EntityReader` for a helper that only reads. Handler contexts are inferred;
`ServiceToolContext` and `ServiceJobHandlerContext` are available when needed.
Native `JobEntityAccess` is not the tool, service-job, or subscription API.

A service's `routes: ({ entities }) => [...]` slot receives the same typed
reader. A route can call `entities.list(reminder)` directly; it need not pass
setup's entity access through `state`. The routes reader has no write methods.

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
    "@types/node": "^24.13.3",
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
    "types": ["node"],
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

Eight golden packages form one reading-library example. The ninth,
[`reminders`](../packages/brain-cli/test/fixtures/public-authoring/reminders/src/index.ts),
is a standalone example with [four packed public-harness tests](../packages/brain-cli/test/fixtures/public-authoring/reminders/test/consumer.ts).

The reading-library packages fit together as follows:

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

With the default markdown codec, `content` is the body and `metadata` contains
its declared fields. Creating or updating a record does not fold stored YAML
frontmatter into the body returned by reads. A custom `markdown` codec can
intentionally retain a complete file instead; use `frontmatterInContent()` when
your type's consumers require unindexed frontmatter as part of `content`.

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
    const answer = await installed.tool("calendar-timezone").call({});
    if (!answer.ok && "error" in answer) {
      // A failed test shows the author's original exception as the cause.
      throw new Error(answer.error, { cause: answer.cause });
    }
    return answer.ok &&
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

Tools return `{ ok: true, data }`, `{ ok: false, error, code, cause }`, or
`{ ok: false, confirmation }` when approval is pending. `cause` is the original
thrown value, available for test diagnostics; it is `undefined` for refusals
without an exception. Assert on `error` and `code` for the sanitized production
response, and inspect `cause` to learn why your handler failed. Job `run()`
rejections likewise preserve the thrown value as their coded error's `cause`.
Production tool responses do not include diagnostic causes. Check
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
to `request(subscription, input)`, including from another package after declaration
emit. `SubscriptionDefinition` and `RequestContract` are exported types from both
services and interfaces when a shared helper needs to name those contracts.
Notifications without a response schema do
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

Use `installed.tool("remind")` and `installed.job("fire")` with the names in
your declarations. Tools expose `localName` alongside the runtime-scoped `name`;
`installed.tools` and `installed.jobs` remain available for inspection. Unknown
or ambiguous lookups throw with available local names.

`installed.job("fire").run(input)` validates
and runs one handler attempt in-process; it does not simulate durable queue
retries, deadlines, or terminal hooks. `harness.templateNames()` lists local
names; `harness.formatTemplate("due-list", value)` validates and formats the
unique matching text template. Give templates distinct local names when testing
multiple packages in one harness. Missing or ambiguous names throw rather than
selecting an arbitrary template. Both `harness.fetch()` and
`harness.fetchResponse()` exercise declared routes with their authentication and
schema validation. `fetch()` decodes JSON responses to data (including JSON
returned explicitly by a protocol route). Use `fetchResponse()` for an
unconsumed standard `Response` so you can assert status codes, headers, cookies,
and bodies regardless of content type.
The harness hands back names and answers rather than runtime objects, which is
why nothing here imports `@brains/*`.

### Reader capabilities

Use the capability handed to your callback:

- Entity reads use `get(definition, id)`, `list(definition, options)`, and
  `search(definition, query, options)`; metadata is inferred from the definition.
- Job uploads provide `read`, attachments provide `resolve`, and progress provides
  `report`. Interface upload writers provide `save`/`remove`; choose a namespace
  that is one flat path segment.
- Use the supplied logger (or its child), permission checker, profile reader, and
  auth operations. Do not reach through them to runtime services or lifecycle
  controls. Detached method calls are supported.
- Treat configured spaces and policy metadata as snapshots. Editing returned
  metadata does not change registry policy or other readers.
- Attachment-provider factories receive `domain`, `themeCSS`,
  `identity.getProfile`, and `entityService.getEntity`/`listEntities`.

State and upload namespaces are scoped by the runtime. Supply local names, not
package encodings or filesystem paths. Upgrade effects on existing state and
uploads are covered in the [migration guide](./public-release/AUTHORING_0.2_MIGRATION.md).

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
attempt. In tests, inspect the failed tool result's `cause` for the original
exception; it is not part of the production response.

Durable service/operator job status exposes `error` and `code`; interface status
uses `lastError` and `code`. Codes survive queue restarts.
Batch status and progress expose `{ code, message }` error records; missing
children report `not_found`. Batch coordination remains in memory, so do not
rely on batch metadata surviving a runtime restart. Terminal hooks receive
validated input and coded failures.
The public single-attempt job runner throws coded failures but does not simulate
worker retries, deadlines, or terminal hooks.

For uploads, branch on `invalid_input` for an invalid reference,
`invalid_response` for unreadable/invalid data, or `not_found` for a missing upload.

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
