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

Fourteen packages meet this today: `prompt`, `style-guide`, `doc`,
`products`, `series`, `blog`, `decks`, `portfolio`, `social-media`,
`wishlist`, `assessment`, `topics`, `link`, and `note`. `@brains/doc` is
the smallest worked example; `@brains/topics` is the one that needed the
most new surface to express what it already did.

## Promoting a symbol onto the SDK

When a package needs something the SDK does not export, the question is not
"how do I get at it" but **"should an external author have this?"**

Promote when the answer is yes, and say who asked. Several export blocks in
`packages/brain-sdk/src/entities.ts` carry a comment naming the package that
needed them — that is not decoration, it is the record of why the surface
grew, and it is the convention to follow for anything you add. An export
nobody asked for can never be removed once published.

Do not promote the shape you found — promote the question the package was
really asking. `@brains/note` reached for the uploads namespace to import a
markdown file, and declared a filesystem namespace, a client ref kind, and
`/api/chat/uploads` to do it. Only the namespace affects which bytes come
back; the rest is a chat interface's plumbing, named by a package that has
no business knowing a file arrived over chat. Promoting `uploads.scoped()`
would have cemented that. What a job actually asks is "read the upload I was
handed", so that is what the SDK exposes: `uploads.read(id)`, with the
runtime supplying the scope.

Sometimes the answer really is that the code is in the wrong place, and no
narrowing helps. That question was applied package by package until every
official entity and plugin package was publishable-clean; what it settled
lives in the guards below rather than in a plan.

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
- **The whole parallel pipeline.** Topics kept six modules — an extractor,
  a batch extractor, a rebuild, a reconciliation, a merge synthesizer and a
  service — reachable only from its eval handlers, because extraction had
  moved into a projection rule and the evals kept calling the old path. The
  evals passed the entire time while measuring code no user ever ran, and
  the semantic merging they measured turned out not to exist in production
  at all. An eval must drive the live path: `runProjectionRule(rule)` on the
  eval context runs a rule's select and derive and returns what it would
  write, which is the measurement without the orchestration.

Two questions catch most of it: _what constructs this?_ and _if the answer
is only a test, what does the live path do instead?_

Then move the tests, do not delete them. The behaviour is usually real — it
just belongs to whatever runs now. Codec round-trips go against the adapter
the registry hands out (`harness.getEntityRegistry().getAdapter(type)`);
generation behaviour goes against the declaration.

### Work that starts now and finishes later

An import or a generation has to do two things at once: hand the caller a
real id straight away, and give the slow part to a job. Neither `create`
nor `delegate` alone says that — `create` reports work as finished when it
has not started, and `delegate` queues without allocating anything. Return
both:

```ts
create: {
  fromUpload: {
    resolve: async ({ input, uploads }) => {
      const record = await uploads.readRecord(input.from.id);
      if (!supported(record.mediaType)) return { refuse: "…" };
      return {
        create: { id, content: placeholder, metadata: { status: "generating" } },
        delegate: { job: "upload-import", input: { uploadId: input.from.id } },
      };
    },
  },
},
```

The runtime writes the placeholder, deduplicating its id, and enqueues the
job with that id **and the placeholder's content hash**. Declare the job with
`generate` rather than `handle` and it inherits the whole lifecycle: the
write on success, the failure marking on error, and — because of the hash — a
refusal to overwrite an entity the user edited while the job was queued. A
job declared with `handle` owns all of that itself, and the failure case is
the one everybody forgets: an entity left saying "generating" forever, with
nobody left to say why.

Uploads are read through `uploads.read(id)` on the job and create contexts.
A package never names a filesystem namespace, a client ref kind, or an HTTP
route — note used to declare all three, including a chat interface's route
path, none of which affects which bytes come back.

### Three things that bite

**Template names in `ai.generate`.** The same trap as data source ids, one
level worse, because nothing rendered catches it. `ai.generate` looks a
template up in the registry by its exact registered name, with no scoping
applied — and a declaration registers under `<packageName>:<entityType>:<local>`.
Every `templateName: "blog:generation"` written for a class plugin keeps
type-checking and fails at generation time as `Template not found`, which is
a background job, so nothing user-facing reports it.

Never write the name. Ask for it:

```ts
generate: async ({ ai, template }) => {
  await ai.generate({ templateName: template("generation"), ... });
}
```

`template(localName)` is on the job context, the eval context, and the
`projectionRules` / `evals` slots on a service definition. It throws for a
name the package does not declare, so a typo fails at registration rather
than during the job that needed it. A rule built outside a slot takes the
resolved name as an argument, and carries it through its input schema so
`derive` can reach it.

The template's own `name:` field is a separate thing and stays as it was
(`"blog:generation"`): it is the stable identity of the prompt entity a user
edits, and must not move when the package's runtime scope does.

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
