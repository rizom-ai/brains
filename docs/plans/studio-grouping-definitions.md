# Plan: Studio Grouping Definitions

Last updated: 2026-09-27

## Status

**Document-owned groupings shipped in alpha.425 and are deployed to smoke. The convention-first type-exclusion follow-up is in progress on `feat/grouping-type-exclusions`.** PR #383 is merged. Smoke is the only site using this feature and is a test site. No legacy compatibility, conversion tool, conversion rehearsal or matched migration rollback is required. This plan does not authorize deployment or changes to existing smoke data.

The released baseline is PR #302, `0.2.0-alpha.404`, deployed to smoke with configured groupings and an administrator-owned vocabulary. The replacement uses one `grouping-definitions` document and unified controls. Runtime contracts are documented in the [Studio README](../../plugins/studio/README.md) and [entity-service README](../../shell/entity-service/README.md); the earlier [collections](./studio-virtual-collections.md) and [vocabulary](./studio-grouping-vocabularies.md) plans identify the original rollout.

The implementation preserves exact Markdown memberships, opaque identities, paths, owner/plugin refinements, strays and historical duplicates. Labels, cardinality, optional lists and optional type exclusions come from the document. Eligible content types participate by default; exceptions are edited under a collapsed Exclude types disclosure, not an Applies to checklist. Readiness and bounded reprojection remain process-local and ephemeral. There are no legacy readers, aliases, dual writes, automatic conversion or durable readiness records. Unknown configuration keys use ordinary strict-schema validation.

Create/update/delete default to administrator access, with publishing disabled. Explicit per-type instance permission rules can override action defaults under the shared permission service; this is not an unoverrideable administrator floor.

## Validation evidence

- Integrated main through `f41e0cc07c` in `300ae046e5`, retaining both source-persistence and upstream content-edit regressions. Mainline `alpha.422` package metadata was inherited without manual version bumps or restored consumed changesets.
- At `39c6b19e6a`, all six GitHub CI checks passed: build, lint, typecheck, tests, dependency architecture and console visual regression. Studio had 780 passing tests plus 35 application-owned grouping integration tests with 266 assertions; Brain had 495 tests with 14 gated skips. These counts precede removal of the obsolete editor's tests.
- The explicitly enabled packed CLI grouping canary passed 22 assertions. Normal commit hooks passed 96 lint, 104 typecheck and 102 test workspace tasks.
- The Studio visual/accessibility gate passed against unchanged baselines at the existing **0.2%** tolerance, using pinned Chrome and documented Fontconfig settings.
- Fresh canonical publishing acceptance used real HTTP authentication with isolated seeded sessions and mocked AI: 26 captures, including 25 desktop/phone accessibility and overflow checks across paper/instrument climates. It covered all four membership modes, administrator/trusted access, scoped counts, exact values and refused-save draft retention.
- A real uploaded image rendered without expanding authored memberships, unclaimed frontmatter or body references during save/export/import. Code examples caused no image reads. Definition policy remained literal in the database and exported Markdown after sync and restart. A new manual sync settled successfully after an interrupted run was retained as failed.
- Preview was rebuilt through the running app before inspecting managed `dist/site-preview`; hostname-routed preview and generated output were verified. Cold launcher-to-readiness time, including build, was **15.18 seconds**, below the **30-second** gate.

Post-integration evidence is retained at `/tmp/studio-definitions-integrated-kNAiNn/evidence.json`, `settled-sync-workspace.json` in that directory, `/tmp/studio-main-packed.log` and `/tmp/studio-main-visual.log`. Earlier restart and interrupted-run evidence is retained at `/tmp/studio-definitions-verified-qYH5IL`; the original failed fixture remains separate rather than silently repaired. No smoke or existing demo accounts, passkeys or sessions were changed.

## Approved review artifacts

The approved [definitions page](../studio-grouping-definitions-mockups.html), [membership controls](../studio-grouping-editor-mockups.html), and [earlier control comparison](../studio-grouping-values-redesign-mockups.html) remain frozen historical review artifacts. Their illustrative counts and “current/proposed” labels describe the review checkpoint, not the current runtime.

The obsolete vocabulary editor, closed-field helper and review-era generator are removed. Their source history remains in Git; retaining approved HTML does not require maintaining an old UI implementation. Do not regenerate approved HTML or visual baselines merely to make a check pass.

## Remaining work

1. Finish review and required checks, reconciling the release with mainline package metadata and consumed changesets. A committed changeset is not a release.
2. After release/deployment authorization for the follow-up, update smoke's test definitions to omit explicit `types` lists, using `excludeTypes` only for intentional exceptions. The old configuration was already removed by rover-pilot PR #94. Keep desired-state changes in operator-owned inputs, not generated files; do not build a legacy converter or a compatibility path.
3. Verify the running smoke app: administrator/trusted views, exact memberships, all four rule modes, scoped counts, stray markers, refused-save draft retention and source round trips. Rebuild preview through the running app before inspecting output. Health alone is not acceptance.

Keep the scope smoke-only. Do not reset unrelated content, accounts, passkeys or sessions, or modify the existing demo or other brains. Preserve the 30-second startup and 0.2% visual gates. No fleet expansion or automatic data reset is implied.

After release and smoke acceptance, record the durable contract and release outcome in implementation documentation and release notes, remove this plan from the roadmap, and retire it under the [planning cleanup policy](./README.md).
