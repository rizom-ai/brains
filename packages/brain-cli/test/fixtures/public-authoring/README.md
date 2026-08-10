# Public authoring `0.2` reference packages

These six standalone packages are the executable reference for the external
`0.2.x` authoring API. They are deliberately one cohesive example rather than
six unrelated snippets: a Brain that saves bookmarks, derives reading digests,
accepts webhook and Campfire events, and renders a reading-library site.

> **Last exact registry evidence:** `@rizom/brain@0.2.0-alpha.272` and
> `@rizom/site@0.2.0-alpha.233`. These are review candidates, not stable release
> recommendations.

Start with the practical guide at `docs/external-plugin-authoring.md`. Use this
directory when you want complete source, manifests, and TypeScript
configuration that have actually passed the package boundary.

## System map

```text
@fixture/reading-entities
  bookmark ──bookmark-digest projection──▶ reading-digest
      ▲                                      ▲
      │                                      │
@fixture/reading-insights                    │
  compile-reading-digest tool ──▶ durable job┘
      ▲
      │
@fixture/reading-webhook
  authenticated HTTP route + event-feed daemon

@fixture/campfire-interface
  authenticated inbound chat + send/edit/deliver

@fixture/reading-site
  layout + route + schema-backed hero + entity display + assets

@fixture/reader-brain
  use() + bundle + identity + site composition
```

## Read in this order

| Step | Package                                                 | What it demonstrates                                                                                          |
| ---- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1    | [`entity`](./entity/src/index.ts)                       | `defineEntity`, inferred `EntityOf`, definition-based projection, typed target writes                         |
| 2    | [`service`](./service/src/index.ts)                     | Parsed config/setup state, resources/prompts/templates/views, reusable job contract, handler, tools           |
| 3    | [`interface`](./interface/src/index.ts)                 | Public and protocol routes, runtime-derived caller, cross-package job enqueue, supervised daemon              |
| 4    | [`message-interface`](./message-interface/src/index.ts) | Channel/recipient declaration, authenticated inbound messages, lazy attachments, normalized send/edit/deliver |
| 5    | [`site`](./site/src/index.tsx)                          | One-import site definition, typed content, routes/layout, entity display, CSS, head script, static asset      |
| 6    | [`brain-definition`](./brain-definition/src/index.ts)   | Typed `use()`, configured definitions, bundle membership, identity, and site selection                        |

The message transport keeps its ordinary protocol client in
[`campfire-client.ts`](./message-interface/src/campfire-client.ts). That split
is intentional: the public API owns Brain integration, while the package owns
its transport SDK code.

## Entity-to-template flow

Entity packages do not declare presentation templates. The service fixture
shows the stable composition path:

1. export the `bookmark` entity definition from the entity package;
2. import it into the service package;
3. read it with `entities.get(bookmark, id)` in the durable job;
4. transform it into the shared `digestResult` schema;
5. call `templates.format("digest", result)`;
6. publish the formatted text or return/persist it through the desired domain
   capability.

The `digest` template and `digest` view deliberately reuse the exact
`digestResult` schema object. The template produces Markdown; the view produces
web output. Neither is the entity's optional persistence Markdown codec, and a
site route's `template: "library.hero"` is a section reference rather than a
service formatter.

## What to copy

Copy the package closest to your use case, then delete capabilities you do not
need. In particular:

- an entity package with one entity can default-export its focused entity
  package without inventing adapter classes;
- a service without durable work can omit `defineJob()` and `jobs` entirely;
- an interface without a listener can omit `daemons`;
- an outbound-only message transport can omit `listen`, `send`, and `edit` and
  implement only `channel` plus `deliver`;
- a site can omit any structural field it does not use.

Do not copy fixture package names or IDs as framework conventions. Names such as
`reading-insights` and `bookmark-digest` are domain choices.

## What the examples intentionally do not contain

Author source contains no:

- private workspace imports or direct Zod dependency;
- package-manifest/name/version import;
- cast or `unknown` bridge around public callbacks;
- runtime-owned entity base fields;
- fully qualified capability names;
- registry call, queue contract, or process-role branch;
- class-based plugin lifecycle;
- placeholder method required only to satisfy a base class.

The runtime supplies package scoping, registration/finalization, rollback,
shutdown, entity storage/search, projection scheduling, durable execution,
caller permissions, conversations, attachment policy, and progress tracking.

## Standalone package shape

Every reference package has:

- a private fixture manifest that mirrors a publishable ESM package;
- one default definition export;
- generated JavaScript/declaration export paths;
- a self-contained strict `tsconfig.json` with no monorepo `extends`;
- the same nominated Brain peer lower bound;
- only public family imports in author source.

The test harness injects exact SDK development dependencies while building the
fixtures. A real external package should declare both:

```json
{
  "peerDependencies": {
    "@rizom/brain": ">=0.2.0-alpha.272 <0.3.0"
  },
  "devDependencies": {
    "@rizom/brain": "0.2.0-alpha.272"
  }
}
```

A site package also carries an exact direct dependency on
`@rizom/site@0.2.0-alpha.233` during the preview.

## How the evidence works

Per-PR tests build and pack local SDK artifacts, then build each fixture and
install the complete consumer outside the monorepo. The phase tests exercise:

- package loading, metadata inference, and typed composition;
- entity CRUD/FTS/visibility, projection convergence, and restart durability;
- durable job enqueue, worker execution, progress, result, and recovery;
- route authentication/caller resolution, daemon readiness, shutdown, and
  worker exclusion;
- message descriptor/delivery/listener/send/edit behavior;
- running-app preview rebuild and generated site output.

Run the source/ledger checks:

```bash
bun test packages/brain-cli/test/public-authoring-golden.test.ts
```

Run all local packed proofs:

```bash
bun test \
  packages/brain-cli/test/public-authoring-phase1-packed.test.ts \
  packages/brain-cli/test/public-authoring-phase2-packed.test.ts \
  packages/brain-cli/test/public-authoring-phase3-packed.test.ts \
  packages/brain-cli/test/public-authoring-phase4-packed.test.ts \
  packages/brain-cli/test/public-authoring-phase5-packed.test.ts
```

The npm registry matrix is opt-in and exact-version only:

```bash
RIZOM_PUBLIC_API_REGISTRY_EVIDENCE=1 \
RIZOM_PUBLIC_API_BRAIN_VERSION=0.2.0-alpha.272 \
RIZOM_PUBLIC_API_SITE_VERSION=0.2.0-alpha.233 \
bun test packages/brain-cli/test/public-authoring-registry-packed.test.ts
```

It verifies installed versions, licenses, declarations, export maps, removed
entry points, all six fixture builds, and standalone startup. It refuses ranges
and requires every golden Brain peer lower bound to match the nominated alpha.

## Contract files

- [`export-ledger.json`](./export-ledger.json) classifies every authoring export
  as stable, advanced-with-consumer, or internal/removable.
- `docs/public-release/AUTHORING_API_0.2.md` is the human-readable patch-stable
  symbol ledger.
- `docs/public-release/AUTHORING_0.2_MIGRATION.md` maps removed alpha signatures
  to the declarative API.

There is no compatibility-facade category. If prose and fixture source disagree,
the checked fixture and export ledger are authoritative.
