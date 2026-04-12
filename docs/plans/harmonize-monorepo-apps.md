# Plan: Unify App Shape

This is no longer separate work.

## Decision

Do **not** spend time making in-repo apps mimic the full standalone scaffold.

Current rule:

- standalone repos use the full `brain init` shape
- monorepo apps stay lightweight instance directories until extracted

## Why

The earlier mismatch was real, but extraction won.

Since this plan was written:

- `brain init` now scaffolds the real standalone shape
- `mylittlephoney` was extracted
- `yeehaa.io` was extracted
- standalone repos gained repo-owned publish/deploy workflows
- remaining monorepo apps are few enough that direct extraction is cleaner than harmonization work

So the old intermediate goal — make monorepo apps look like standalone repos before extraction — is not worth carrying.

## What to do instead

When a remaining app needs independence, extract it directly into the standard standalone shape.

Current in-repo apps:

- `apps/rizom-ai`
- `apps/rizom-work`
- `apps/rizom-foundation`

Extraction guidance lives in:

- `docs/plans/standalone-apps.md`
- `docs/plans/deploy-kamal.md`

## What stays true

The user-facing shape is still the standalone shape scaffolded by `brain init`.

That means:

```text
brain.yaml
package.json
tsconfig.json
README.md
src/site.ts
src/theme.css
```

plus optional deploy artifacts from `--deploy`.

## Non-goal

Do not re-add app dirs to workspace membership just to make shapes match.

## Related

- `docs/plans/standalone-apps.md`
- `docs/plans/public-release-cleanup.md`
- `docs/plans/library-exports.md`
