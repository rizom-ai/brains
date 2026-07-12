# Plan: Schema-first site sections

## Status

**This initiative's scope is done** (2026-07-12, `work/rizom-consolidated-site`).
Phase 1 (`@rizom/site-sections` + brain-side introspection), Phase 2 (`sections`
wired through `createRizomSite` → `DeclarativeSitePlugin` registration), and Phase 3
(all three rizom-ai pages migrated to `defineSection`; the field-DSL `site-content.ts`
deleted; copy authored into `rizom-ai/rizom-content` as `site-content/<page>/<section>.md`
through the derived formatter) all landed and stayed green across the full suite.

Still **tracked follow-up** (not this initiative): migrate relay's content to
`defineSection`, then remove `@brains/site-content` + the field DSL from `@rizom/site` +
`createSiteContentTemplate`'s fields path. Feeds
[`rizom-consolidation.md`](./rizom-consolidation.md) Phase 5 — the consolidated site's
copy is now authored on this model.

Known nicety left open: section field labels are derived from field names
(`primaryCta` → `## Primary Cta`); a `.meta({ label })` override in the introspection
would let headings differ from field names (e.g. "Primary CTA"). Not wired — the derived
labels round-trip and are CMS-internal, not rendered copy.

## Why

Porting rizom-ai onto the published site model surfaced a real regression in the
`SiteContentDefinition` **field DSL**: a section's shape is hand-written twice — once as
the component's prop type (`HomeHeroContent`) and once as the `fields: { … }` DSL — with
**no compile-time link** between them (`SiteContentSectionDefinition.layout` is typed
`ComponentType<unknown>`). They can drift silently, and the CMS/formatter then disagrees
with the component. The markdown round-trip the DSL drives is also intricate enough
(string arrays → `-` bullets, object-array headings → `label.slice(0,-1)+" N"`) that
authoring content by hand is error-prone.

rev-5 did not have this problem: its `defineSection` took **one zod schema** per section
and derived the formatter from it by introspection, with the component typed
`(props: z.infer<schema>)` — a single, type-checked source of truth. The published field
DSL dropped that. This plan restores it as the sanctioned model.

## Key insight (small blast radius)

The authoring surface is the only thing that must change. The storage/edit/render
machinery is all downstream of a plain `Template` (schema + `StructuredContentFormatter` +
component) and does not care how the Template was authored:

- the `"site-content"` entity type + adapter (`plugins/site-content`),
- the `site-content/<route>/<section>.md` directory-sync convention
  (`plugins/directory-sync/src/lib/entity-paths.ts`),
- the render precedence dataQuery → content entity → inline fallback
  (`plugins/site-builder/src/lib/content-resolver.ts`),
- the CMS (generic template editing — no site-content-specific code),
- `StructuredContentFormatter` itself.

So the new model must produce the **same `Template` shape** the rest already consumes.
Everything above is reused untouched.

## Design

Split mirrors the existing architecture (field DSL types are published in `@rizom/site`;
`createSiteContentTemplate` is brain-side in `@brains/site-composition`):

- **`@rizom/site-sections` (new, published, thin).** The authoring surface published site
  packages import. `defineSection(schema, component, { title, description,
requiredPermission?, fullscreen? })` packages a zod schema + component + metadata into a
  typed `Section` descriptor, with `component: (props: z.infer<typeof schema>) => JSX` so
  the props are **compile-time tied** to the schema. `sectionGroup(namespace, sections)`
  bundles a namespace. Re-exports `z` so sites get a controlled zod. No formatter, no
  `Template` — keeps published deps minimal (zod + preact types + `@rizom/site` types).
- **`@brains/site-composition` (brain-side).** Add the schema→`Template` path: introspect a
  section's zod schema into `StructuredContentFormatter` mappings and build the `Template`
  (name/description/schema/formatter/layout). This is rev-5's `section-def.ts`
  (`toMapping`/`shapeMappings`/`fieldLabel`/`unwrapOptional`) promoted into the framework,
  running where the internal formatter already lives (at brain boot, not in the published
  artifact).
- **`createRizomSite` / registration.** Accept schema-first section groups and register
  them as Templates via the same declarative seam the `content` field DSL uses today
  (`shell/app/src/brain-resolver.ts`), so CMS + directory-sync + resolver light up
  unchanged.

## Phases (thin vertical, tests first)

### Phase 1 — `@rizom/site-sections` + schema→Template introspection

Walking skeleton: one section authored from a schema round-trips.

- New published package: `defineSection`, `sectionGroup`, `z` re-export, types. Component
  props tied to `z.infer<schema>` (a type-level test / `satisfies` guards the tie).
- Brain-side introspection in `@brains/site-composition`: schema → `FieldMapping[]` →
  `StructuredContentFormatter` → `Template`, ported from rev-5's `section-def.ts`.
- Tests first: a section's schema formats→parses round-trip through the derived formatter;
  introspection covers string/number/enum/object/array/optional; an unsupported schema
  shape throws at definition time (not at render).

### Phase 2 — Wire through `createRizomSite`

- Add a `sections?: SectionGroup | SectionGroup[]` option to `CreateRizomSiteOptions`;
  convert to Templates and register via the declarative seam so published sites register
  them exactly like `content` definitions today.
- Tests: a `createRizomSite({ sections })` registers working templates; a section renders
  from a `site-content` entity and, absent one, from an inline fallback (resolver
  precedence intact).

### Phase 3 — Migrate `sites/rizom-ai` + author the copy

- Colocate a zod schema per section with its component (component props become
  `z.infer<schema>`), replacing `sites/rizom-ai/src/site-content.ts`'s hand-written field
  DSL with `sectionGroup`s built from `defineSection`. Delete the field-DSL file.
- Author the rev-5 copy into `rizom-ai/rizom-content` as `site-content/<page>/<section>.md`
  — generated through the derived formatter for round-trip correctness. This is the
  consolidation plan's copy-authoring step, now on the schema-first model.
- Green across the site package + rover.

### Follow-up (tracked, not this initiative)

- Migrate relay's `site.tsx` content definitions to `defineSection`.
- Remove `@brains/site-content` (plugin), the field DSL types from `@rizom/site`, and
  `createSiteContentTemplate`'s fields path from `@brains/site-composition`. The
  `"site-content"` entity type + adapter + sync convention move to their permanent home
  (the new package's brain-side half or a small entity package) rather than being deleted.
- `sites/rizom-work` and `sites/rizom-foundation` are retired by the consolidation
  (deleted, not migrated).

## Verification

1. A section is defined once (a zod schema); its component fails to typecheck if its props
   diverge from `z.infer<schema>`.
2. Content authored for that section round-trips through the derived formatter (format →
   file → parse → equal value).
3. rizom-ai renders home/work/foundation from `site-content` entities in `rizom-content`,
   CMS-editable, with the field DSL file gone.
4. Per-package gates pass; the published `@rizom/site-sections` carries only
   zod + preact-types + `@rizom/site` deps.
