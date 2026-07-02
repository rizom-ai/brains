# Plan: Compound capability packages

## Status

Proposed. Trigger: `bun run arch:check` has six standing violations, all
of one shape — a capability whose entity type and service plugin live in
separate packages, forcing plugin→entity and plugin→plugin imports that
the layer rules correctly forbid. The decision (already made in
discussion) is to allow compound packages: one package defines an entity
type and the service plugin(s) that operate on it together. This plan
executes that decision. The dependency-cruiser rules do not change.

## Context

The six violations:

| From                                           | To                    | Nature                        |
| ---------------------------------------------- | --------------------- | ----------------------------- |
| `plugins/playbooks/src/plugin.ts`              | `entities/playbook`   | domain (adapter, validation)  |
| `plugins/playbooks/test/plugin.test.ts`        | `entities/playbook`   | installs entity plugin        |
| `plugins/rover-onboarding/test/plugin.test.ts` | `entities/playbook`   | installs entity plugin        |
| `plugins/newsletter/src/index.ts`              | `entities/newsletter` | composite factory             |
| `plugins/newsletter/src/index.ts`              | `plugins/buttondown`  | composite factory             |
| `plugins/rover-onboarding/src/index.ts`        | `plugins/playbooks`   | message-channel constant+type |

These are not accidental drift — each is a capability split across
packages: the playbook capability spans `entities/playbook` and
`plugins/playbooks`; the newsletter capability spans
`entities/newsletter`, `plugins/buttondown`, and the
`plugins/newsletter` composite. The split forces imports the
architecture forbids, and the packages are not independently reusable
anyway (buttondown and newsletter-entity have zero consumers outside
the composite; the playbook entity is only installed next to the
playbooks plugin — `brains/rover` declares both).

## Goal

One package per capability. A compound package may export an entity
plugin, a service plugin, and a composite factory together; imports
between those parts are intra-package and violate nothing. After the
merges plus one contract move, `arch:check` is green with the existing
rules untouched.

## Non-goals

- Changing any dependency-cruiser rule. The rules stay authoritative;
  compound packages satisfy them structurally.
- Merging every entity package into a plugin. Entities consumed by many
  plugins or by none (blog, note, doc, link, …) stay standalone entity
  packages. Compound is only for a 1:1 entity↔service pairing.
- A general plugin-composition framework. The composite factory pattern
  (`newsletter(config): Plugin[]`) already works; it just moves inside
  the compound package.

## Decisions

### 1. A compound package lives in `plugins/`

It is a plugin package that happens to also own its entity type. The
entity adapter/schema are implementation modules of the package
(`src/entity/`), and the package may export multiple plugins
(entity plugin + service plugin + composite factory). Brains keep
installing the parts they want; only the import topology changes.

### 2. `plugins/playbooks` absorbs `entities/playbook`

- `entities/playbook/src/*` (adapter, schema, `assertValidPlaybookBody`,
  entity plugin wrapper, types) moves to
  `plugins/playbooks/src/entity/`.
- `plugins/playbooks` exports both `playbookPlugin` (entity) and
  `playbooksPlugin` (service), plus the domain types it already
  re-exports today.
- Consumers update imports: `brains/rover` (src + seed test),
  `plugins/rover-onboarding/test`. All three currently import
  `@brains/playbook`; they import from `@brains/playbooks` instead.
- `entities/playbook` is deleted; changesets pre.json and pending
  changeset frontmatters cleaned per the established deleted-package
  procedure.

### 3. `plugins/newsletter` absorbs `entities/newsletter` and `plugins/buttondown`

The newsletter capability is entity + Buttondown-backed service +
composite factory; nothing consumes the parts individually (verified:
`@brains/newsletter-entity` and `@brains/buttondown` each have exactly
one consumer — the composite). Layout after the merge:

- `plugins/newsletter/src/entity/` — the newsletter entity plugin
- `plugins/newsletter/src/provider/` — the Buttondown client, service
  plugin, publish handler, subscribe routes (today's
  `plugins/buttondown/src`)
- `plugins/newsletter/src/index.ts` — exports `newsletterPlugin`
  (entity), `buttondownPlugin` (service), and the `newsletter()`
  composite factory, unchanged signatures
- `entities/newsletter` and `plugins/buttondown` are deleted, changesets
  cleaned.

If a second newsletter provider ever appears, it becomes another
`src/provider-*` module in the same capability package — not a new
top-level package (consistent with the single-brain direction).

### 4. The lifecycle-starter contract moves to `shared/contracts`

`plugins/rover-onboarding` imports only
`PLAYBOOKS_REGISTER_LIFECYCLE_STARTER` and
`LifecycleStarterRegistration` from the playbooks package — a
cross-plugin message contract, which is exactly what
`shared/contracts` holds (`AGENT_ACTION_REQUEST_CHANNEL`, …). The
channel constant and registration schema/type move there; both plugins
import from `@brains/contracts`. rover-onboarding stays a separate
plugin (it is brain-specific onboarding, not part of the playbook
capability) and after this move imports nothing from another plugin.

### 5. Harness tests install compound exports

The two test files that installed the entity plugin from
`entities/playbook` install it from their own package
(`plugins/playbooks/test`) or from `@brains/playbooks`
(`plugins/rover-onboarding/test`, alongside the contract import). No
harness changes needed.

## Phases

Each phase lands green in isolation: package tests, typecheck, lint,
and `bunx depcruise` for the touched paths, with the violations for
that capability gone.

### Phase 1 — playbooks compound (walking skeleton)

Move `entities/playbook` into `plugins/playbooks/src/entity/`; update
the four consumers; delete the entity package; clean changesets. Kills
3 of 6 violations and proves the compound shape end to end (exports,
brain wiring, tests, release tooling).

### Phase 2 — lifecycle-starter contract to shared/contracts

Move the channel + schema; update playbooks and rover-onboarding
imports. Kills the rover-onboarding→playbooks violation. Small and
independent; ordered second so Phase 1's export layout is settled.

### Phase 3 — newsletter compound

Merge `entities/newsletter` and `plugins/buttondown` into
`plugins/newsletter` per decision 3; update `brains/rover` deps
(`@brains/newsletter` only); delete two packages; clean changesets.
Kills the remaining 2 violations.

### Phase 4 — document the pattern

Add a short section to `plugins/AGENTS.md` (and
`docs/architecture/package-structure.md`): when an entity type has
exactly one operating service plugin, they ship as one compound package
in `plugins/`; entities with many or no plugin consumers stay in
`entities/`.

## Verification

1. `bunx depcruise --config .dependency-cruiser.js .` → zero errors,
   zero warnings, with `.dependency-cruiser.js` byte-identical to
   before this plan.
2. `turbo run test / typecheck / lint` green repo-wide.
3. `brains/rover` boots with playbook + onboarding + newsletter
   capabilities configured as before (imports updated, behavior
   unchanged); its four tests pass.
4. `bunx changeset status` parses; no pending changeset references a
   deleted package.
5. `entities/playbook`, `entities/newsletter`, `plugins/buttondown`
   directories no longer exist.

## Related

- `docs/plans/plugin-contracts-consolidation.md` — the contracts seam
  these packages publish through; unaffected, but Phase 2 adds to
  `shared/contracts` following its conventions.
- `docs/plans/npm-package-boundaries.md` — fewer published packages is
  consistent with its direction.
