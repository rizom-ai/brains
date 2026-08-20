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

Rename conventional local site source from `src/site.ts` to `src/site.tsx` when it contains JSX. Import brand-specific `Rizom*` layout and chrome types from `@rizom/site-rizom`; they are not part of the generic `@rizom/site` SDK.

## Validation

Before publishing:

1. build declarations from the standalone package;
2. verify generated declarations contain no `@brains/*` imports;
3. pack and install into an empty consumer directory;
4. compose the default definition with `use()`;
5. run the relevant hermetic behavior proof; and
6. declare the tested `@rizom/brain` peer range.

See the [stable authoring ledger](./AUTHORING_API_0.2.md) and the checked [golden packages](../../packages/brain-cli/test/fixtures/public-authoring/README.md).
