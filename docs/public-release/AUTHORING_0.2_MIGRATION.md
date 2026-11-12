# Migrating Alpha Authoring Packages to `0.2`

The `0.2` contract replaces the earlier alpha authoring shapes; it carries no compatibility facades. Migrate a package's source before widening its `@rizom/brain` peer range. The [API ledger](./AUTHORING_API_0.2.md) states each contract and the rules every family shares.

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

## Two-stage definitions

An alpha service, interface or message interface was one object. In `0.2` it takes two arguments: a header that says what the package is, and a behavior that says what it does with that.

| Family            | Header                                                 | Behavior                                                                                                                                |
| ----------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Service           | `id`, `config`, `entities`, `accountSettings`, `setup` | `instructions`, `resources`, `prompts`, `templates`, `jobs`, `tools`, `subscriptions`, `routes`, `dashboardWidgets`, `studioWorkspaces` |
| Generic interface | `id`, `config`, `accountSettings`, `setup`             | `routes`, `daemons`                                                                                                                     |
| Message interface | `id`, `config`, `accountSettings`, `channel`, `setup`  | `daemons`, `listen`, `send`, `edit`, `deliver`                                                                                          |

A package with no behavior passes the header alone. A slot in the wrong argument is refused.

Capabilities move from the call to the slot. An alpha job handler was given `entities`, `messaging`, `templates`, `progress` and `signal` with its input; in `0.2` the `jobs` slot is given `entities`, `messaging` and `templates` once, and the handler it returns is given its call's data, `input`, `progress` and `signal`. A tool's `execute` is given `input` and `signal`, an answer `request` and `sender`, and a route's `handle` `request`, `body` and `caller`. A helper written outside a slot is handed the capabilities it uses.

`setup` is given the parsed `config`, `lifecycle.onCleanup` and `runtimeState({ namespace, schema })`. Keep a cursor, a count or a claim in runtime state rather than in module variables or an entity; the runtime keeps it under the owning package.

## Entities

Replace entity plugin classes, adapters, duplicated base fields, and registration calls with `defineEntity()`, `defineProjection()`, and `defineEntityPackage()`. Declare domain metadata once. The inferred `EntityOf` type includes runtime fields, and the runtime supplies markdown/frontmatter persistence, search, visibility, and projection scheduling.

A service writes only the entity types its header's `entities` lists, and owns them: it installs them with the package and writes them through the slot's `entities`. A package that needs another package's type changed asks that package, its steward, through the contract the steward exports. Reading any type needs no steward.

## Failures

Throw `new SdkError(code, { message, publicMessage })` for a failure a caller should be told about. The `code` reaches the caller everywhere: a tool answers `{ success: false, code, error }`, a job's status carries its `code`, a contract's answer is `{ status: "failed", error }`, and a route answers `{ error, code }` with the HTTP status its code names. Only `publicMessage`, or else the code's standard message, is published; the message stays in the brain's logs. Any other thrown error is `handler_failed`.

## Talking to other packages

Declare each question one package answers with `defineBusContract({ channel, request, response, delivery: "request" })`, and each command every package hears with `delivery: "command"`, and export it. The owner answers in its `subscriptions` slot with `answer(contract, handler)`, on a channel its package name owns (`<package name>:<name>`). An asker calls `messaging.request(contract, request)` and reads a `BusResult`: `answered` with the parsed answer, `unavailable` when nothing answers, or `failed` with the failure's public form.

## Services

Replace positional `createTool(...)`, `toolSuccess()`, and direct queue contracts with object-style `defineTool()` and schema-first `defineJob()`:

- `execute` is given the parsed `input` and returns plain schema-valid output;
- `.handle()` binds durable job execution to the service;
- `jobs.enqueue(job, input)` accepts the reusable typed definition;
- retry, deadline, progress, cancellation, and status remain runtime-owned.

A service serves HTTP routes in its `routes` slot, declared with `defineRoute` and `protocol` as an interface declares them. A package with per-account settings declares them with `defineAccountSettings` in its header.

## Generic interfaces

Replace raw `WebRouteDefinition`, `public: true`, daemon classes, and context registries with:

- `defineRoute({ security: { kind: "public" }, ... })` for public routes;
- `defineRoute({ security: protocol({ authenticate }), ... })` for protocol-authenticated routes;
- `defineDaemon({ run({ signal, health }) { ... } })` for listeners; and
- `defineInterface(header, behavior)` as the package default.

The authenticator returns only the transport actor. The runtime derives permission and Anchor status and supplies the shared HTTP host. Import reusable service job definitions for typed enqueue rather than registering interface-owned handlers.

## Message interfaces

Replace `MessageInterfacePlugin`, support flags, progress registries, native-card requirements, and manual channel registration with `defineMessageInterface(header, behavior)`:

- `channel` in the header declares the descriptor and recipient schema;
- `listen` receives supervised cancellation and health;
- inbound events call `messages.receiveAuthenticated()`;
- `send` and optional `edit` use normalized text;
- `deliver` returns an optional provider ID or throws.

A conversational listener must define `send`. An outbound-only transport may define only `channel` and `deliver`; setup and listener placeholders are unnecessary. A package that runs several message interfaces from one config declares them with `defineMessageInterfacePackage({ id, config, interfaces })`.

## Operator surfaces

Declare a Dashboard widget, a Studio workspace or a workspace action at module scope with `defineDashboardWidget`, `defineStudioWorkspace` or `defineWorkspaceAction`, and bind it with `bind(context, …)` in the service's `dashboardWidgets` or `studioWorkspaces` slot. Its callbacks return semantic view data, not React components or HTML.

## Sites

Replace `@rizom/brain/site` and `@rizom/site-sections` imports with the one SDK, `@rizom/site`. Default-export `defineSite(...)`, author sections with `defineSection()` and `sectionGroup()`, and import its blessed `z`. Stable site definitions do not embed runtime plugins; advanced backend behavior belongs in a separately composed package. A section that renders entities can use the components in `@rizom/brain-ui`.

Rename conventional local site source from `src/site.ts` to `src/site.tsx` when it contains JSX. Import brand-specific `Rizom*` layout and chrome types from `@rizom/site-rizom-ai`; they are not part of the generic `@rizom/site` SDK.

## Validation

Before publishing:

1. build declarations from the standalone package;
2. verify generated declarations contain no `@brains/*` imports;
3. run the package's own tests with `startTestBrain` from `@rizom/brain/testing`;
4. pack and install into an empty consumer directory;
5. compose the default definition with `use()`; and
6. declare the tested `@rizom/brain` peer range.

See the checked [golden packages](../../packages/brain-cli/test/fixtures/public-authoring/README.md).
