# Migrating Alpha Authoring Packages to `0.2`

The stable `0.2` contract intentionally replaces the earlier alpha authoring shapes instead of carrying compatibility facades. Migrate package source before widening its `@rizom/brain` peer range.

## Package entry points

| Removed alpha shape                        | `0.2` shape                                                          |
| ------------------------------------------ | -------------------------------------------------------------------- |
| Root `z` or direct `zod`                   | Import `z` from the package family entry point                       |
| Plugin subclasses                          | Default-export a declarative `define*` result                        |
| Named `plugin` or default factory function | Default-export the package definition object                         |
| Imported `package.json` name/version       | Let the loader bind installed package metadata                       |
| `PLUGIN_API_VERSION`                       | Use an explicit compatible peer dependency range                     |
| `brain.yaml` `plugins.<id>.package`        | Import the definition in a brain package and compose it with `use()` |

## Brain composition

Replace string catalogs, constructors, tuples, and environment mappers with configured definition references:

<!-- public-authoring-example: migration-brain-composition -->

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

Runtime package names, versions, scoped IDs, process roles, and registries must not appear in author source.

## Entities

Replace entity plugin classes, adapters, duplicated base fields, and registration calls with `defineEntity()`, `defineProjection()`, and `defineEntityPackage()`. Declare domain metadata once. The inferred `EntityOf` type includes runtime fields, and the runtime supplies markdown/frontmatter persistence, search, visibility, and projection scheduling.

## Services

Replace positional `createTool(...)`, `toolSuccess()`, and direct queue contracts with object-style `defineTool()` and schema-first `defineJob()`:

- tool callbacks receive parsed `input` and return plain schema-valid output;
- `.handle()` binds durable job execution to the service;
- `jobs.enqueue(job, input)` accepts the reusable typed definition;
- retry, deadline, progress, cancellation, and status remain runtime-owned.

Use `setup({ config, lifecycle })` for inferred state and cleanup instead of constructor state or registration hooks.

## Generic interfaces

Replace raw `WebRouteDefinition`, `public: true`, daemon classes, and context registries with:

- `defineRoute({ security: { kind: "public" }, ... })` for public routes;
- `defineRoute({ security: protocol({ authenticate }), ... })` for protocol-authenticated routes;
- `defineDaemon({ run({ signal, health }) { ... } })` for listeners; and
- `defineInterface()` as the package default.

The authenticator returns only the transport actor. The runtime derives permission and Anchor status and supplies the shared HTTP host. Import reusable service job definitions for typed enqueue rather than registering interface-owned handlers.

## Message interfaces

Replace `MessageInterfacePlugin`, support flags, progress registries, native-card requirements, and manual channel registration with `defineMessageInterface()`:

- `channel` declares the descriptor and recipient schema;
- `listen` receives supervised cancellation and health;
- inbound events call `messages.receiveAuthenticated()`;
- `send` and optional `edit` use normalized text;
- `deliver` returns an optional provider ID or throws.

A conversational listener must define `send`. An outbound-only transport may define only `channel` and `deliver`; setup and listener placeholders are unnecessary.

## Sites

Replace `@rizom/brain/site` and `@rizom/site-sections` imports with the one SDK, `@rizom/site`. Default-export `defineSite(...)`, author sections with `defineSection()` and `sectionGroup()`, and import its blessed `z`. Stable site definitions do not embed runtime plugins; advanced backend behavior belongs in a separately composed package.

Rename conventional local site source from `src/site.ts` to `src/site.tsx` when it contains JSX. Import brand-specific `Rizom*` layout and chrome types from `@rizom/site-rizom-ai`; they are not part of the generic `@rizom/site` SDK.

## Pre-stable `0.2` runtime and testing corrections

These corrections belong to the current-tree alpha API. A local package version
is not evidence that an identically numbered registry artifact contains them.
Breaking alpha cleanup is allowed before stable `0.2.0`; the `0.2.x`
patch-compatibility promise starts only after that release.

### Callback capability boundaries

Scoped state and upload handles now hide implementation fields behind bound
facades. This prevents changing scope through hidden options and supports
detached calls. It is API capability hygiene, not a JavaScript sandbox. Loggers
and child loggers expose logging methods, not file handles or singleton controls;
job progress exposes `report`, not heartbeat timers or reporter construction.
Profile readers return validated metadata and their declared fields schema, not
registration controls. Auth views expose the requested caller, audit, federation,
identity, or administration operations, not service shutdown. Explicit
administration and federation commands remain available: this is not a new
permission policy.

Protocol interfaces receive declared MCP transport operations rather than the
registration service; the MCP SDK server remains available for transport
management. Configured spaces are frozen snapshots. Projection selection gets
entity/conversation readers and spaces; derivation gets its declared AI and logger.

Entity policy, attachment-provider metadata, and view script/static-asset metadata
are detached snapshots. Editing returned metadata no longer changes registry
policy, other readers, or later renders. Declared Zod schemas and renderer
functions retain their identity. Attachment factories receive only `domain`,
`themeCSS`, `identity.getProfile`, and entity `getEntity`/`listEntities`; registration,
messaging, and mutation are not exposed. The public harness uses these same
boundaries.

### Existing state and temporary uploads

Ordinary `@scope/name` packages keep their existing state keys. Unscoped names and
scoped names containing dots now use distinct owner encodings: `@scope/pkg` and
`scope.pkg` no longer share state. Review ownership before migrating ambiguous
old rows; the runtime neither guesses ownership nor falls back to shared keys.

Interface state includes package and declaration identity, even for undotted local
names, and cannot overlap package-owned state. Old declaration-only rows are not
migrated, read, or deleted. Discord/Slack thread-following and mention-routing
settings start fresh; chat history is unchanged.

Temporary upload directories include package, interface ID, and local namespace
identity using a fixed-length digest. Reference shapes and route URLs are
unchanged, but old declaration-only directories no longer resolve. Re-upload
temporary attachments when needed. There is no migration, fallback, or pruning;
old directories remain untouched. Images preserved as entities retain their bytes.

### Entity access, errors, and harness names

Tool, service-job, and subscription callbacks share definition-typed reads and
`create(definition, input)`/`update(definition, entity)` returning `{ id }`, not
native `{ entityId }` mutation records. Native job/setup helpers remain separate.
Service routes now receive a reader directly in their slot context.

Replace message-only error names and `RuntimeUploadStoreError` with the shared
`SdkError` codes; compatibility aliases are not retained. Native workers keep their
controlled-failure protocol, while declared jobs treat schema-valid output as
completed data. Explicit native/protocol refusals retain deliberate messages;
exception boundaries sanitize diagnostics.

Public status readers sanitize old rows without codes and unknown stored codes;
failed rows without error information report `handler_failed`. Batch errors are
`{ code, message }` records rather than strings. Missing children report
`not_found`, unknown codes fall back safely, and batch coordination remains in
memory. Terminal hooks reuse prepared, validated input rather than rerunning
transforms/defaults; corrupt stored inputs cannot reach typed callbacks.

Tool failures in the public harness expose the original exception as `cause`;
production wire responses do not. Replace suffix searches over installed tools
with `installed.tool(localName)` and indexed job selection with
`installed.job(localName)`. Tools retain their scoped `name` for explicit runtime
inspection and add `localName`. `templateNames()` and `formatTemplate()` use local
names; give templates distinct names in a multi-package harness. Missing or
ambiguous lookups throw with available names instead of choosing a match.

## Validation

Before publishing:

1. build declarations from the standalone package;
2. verify generated declarations contain no `@brains/*` imports;
3. pack and install into an empty consumer directory;
4. compose the default definition with `use()`;
5. run the relevant hermetic behavior proof; and
6. declare the tested `@rizom/brain` peer range.

See the [stable authoring ledger](./AUTHORING_API_0.2.md) and the checked [golden packages](../../packages/brain-cli/test/fixtures/public-authoring/README.md).
