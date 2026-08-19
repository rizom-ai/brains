# Official Package Authoring

[External Package Authoring](./external-plugin-authoring.md) covers packages
written outside this repository: they import `@rizom/brain/*` because that is
the only thing published. This page covers the other half — the entity,
plugin, and interface packages that live _in_ this repository and are meant
to ship to npm.

The rule is the same, stated from the inside: **an official package may only
import what an external author could have imported.** In the workspace that
means `@brains/sdk`, which is the package published as `@rizom/brain/*`.

## Why an in-repo package cannot just import `@brains/plugins`

Nothing stops it at build time. The workspace resolves it, TypeScript is
happy, and tests pass. It fails at the point of publishing, and by then the
coupling is load-bearing.

Three things go wrong:

1. **The declaration leaks.** `packages/brain-cli/scripts/build.ts` fails the
   build when a generated `.d.ts` contains a `@brains/*` import. A public
   type that references an internal one drags the internal package into the
   published surface.
2. **The dependency leaks.** Publishing `@brains/blog` with a
   `@brains/plugins` dependency means publishing `@brains/plugins`, and
   everything it depends on, as public API — permanently.
3. **The narrowing gets skipped.** Reaching for the internal package means
   taking whatever shape it already has. Going through the SDK forces the
   question of what the package actually needs, which is usually much less.
   That question is the point; see "Promoting a symbol" below.

## What an official package may depend on

| Tier                                    | Examples                                                                                           | Rule                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------- |
| The published authoring surface         | `@brains/sdk` (`/entities`, `/services`, `/interfaces`, …)                                         | Always allowed              |
| Shared packages that publish themselves | `@brains/ui-library`, `@brains/media-page-composer`, `@brains/content-formatters`, `@brains/image` | Allowed                     |
| Internal shell packages                 | `@brains/plugins`, `@brains/contracts`, `@brains/entity-service`                                   | Production: no. Tests: yes. |

Tests are deliberately exempt. They construct plugins, install harnesses, and
assert against internal contracts — none of which ships. Move the internal
dependency to `devDependencies` rather than deleting it.

Nine packages meet this today: `prompt`, `style-guide`, `doc`, `products`,
`series`, `blog`, `decks`, `portfolio`, and `social-media`. `@brains/doc` is
the smallest worked example.

## Promoting a symbol onto the SDK

When a package needs something the SDK does not export, the question is not
"how do I get at it" but **"should an external author have this?"**

Promote when the answer is yes, and say who asked. Several export blocks in
`packages/brain-sdk/src/entities.ts` carry a comment naming the package that
needed them — that is not decoration, it is the record of why the surface
grew, and it is the convention to follow for anything you add. An export
nobody asked for can never be removed once published.

Do not promote when the reach itself is the problem. `@brains/note` needs the
uploads namespace only because an upload-import job lives in the wrong
package; a narrow uploads reader would have made it publishable while
cementing a coupling that should not exist. Move the code instead. The
[npm-package-boundaries plan](./plans/npm-package-boundaries.md) records this
question and the audit that applied it package by package.

Two guards will notice the promotion:

- **`bun run arch:check`** enforces which package families may import what.
- **The export ledger** (`packages/brain-cli/test/fixtures/public-authoring/export-ledger.json`)
  requires every public export to be classified `stable`,
  `advanced-with-consumer`, or `internal/removable`. A new export fails the
  golden test until it is classified.

## Converting a package

The four publish-pipeline packages went through this in order. Both halves
are needed — a declarative package that still imports `@brains/plugins` is
not publishable, and a class-based package that imports only the SDK cannot
exist, because the base classes are not on it.

1. **Declare what the class did.** `defineEntity`/`defineServicePlugin` slots
   replace `onRegister` hooks: `templates`, `dataSources`, `generation`,
   `evals`, `publish`, `feed`, `attachments`, `create`, `jobs`, `stub`.
2. **Point imports at `@brains/sdk`.** Whatever is missing is either a
   promotion candidate or a sign the code is misplaced.
3. **Move internal deps to `devDependencies`.**
4. **Run `bun run arch:check`** — the gates do not include it.

### Look for the fossils

Every one of these conversions left the same residue: code the class needed,
which nothing calls once the declaration runs, kept alive by its own tests.
Green tests over dead code are the failure mode. Three packages kept a dead
`*GenerationJobHandler` whose suites passed the whole time, which is why a
real regression in the live path went unnoticed —
`system_generate` refused every converted type, because the generated
adapter had no `buildStub` and the old adapter's was unreachable.

Check for:

- **The handler class.** If the entity declares `generation`, any
  `BaseGenerationJobHandler` subclass is dead.
- **The adapter.** A declarative entity builds its adapter from the
  `markdown` codec, so the package's own `toMarkdown`/`fromMarkdown`/
  `buildStub` stop running. Keep only the helpers callers still use, and
  build them on `parseMarkdown`/`generateMarkdownWithFrontmatter` rather than
  `BaseEntityAdapter`.
- **The registration functions.** `registerWithPublishPipeline`,
  `registerEvalHandlers`, and similar are superseded by their slots.
- **The result schemas.** `*GenerationResultSchema` described what the
  handler class returned; a declaration returns `EntityGenerationResult`.
- **Barrel files** re-exporting all of the above.

Then move the tests, do not delete them. The behaviour is usually real — it
just belongs to whatever runs now. Codec round-trips go against the adapter
the registry hands out (`harness.getEntityRegistry().getAdapter(type)`);
generation behaviour goes against the declaration.

### Two things that bite

**Template data source ids.** A class registered data sources under
`<pluginId>:<id>`, so `dataSourceId: "blog:entities"` was right. A
declaration registers under `<packageName>:<id>` and the runtime rewrites a
template's id only when it names a _local_ one. Every reference written in
the old form keeps type-checking and resolves to nothing, which surfaces only
when something renders. `expectTemplateDataSourcesResolve(harness)` from
`@brains/plugins/test` catches it; call it in the package's test.

**Entity ids are user-visible.** Directory sync names files after them. If a
generation stored entities under the title rather than the slug, say so with
`id` on the result — the runtime's default is the slugified title.
