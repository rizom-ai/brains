# Plan: Studio Grouping Definitions

Last updated: 2026-09-27

## Status

**Implementation and isolated authenticated acceptance are complete; replacement release, conversion rehearsal and smoke cutover remain pending.** Work is on `feat/studio-virtual-collections`. Nothing in this plan authorizes a deployment or conversion of existing data.

The released baseline is PR #302, `0.2.0-alpha.404`, deployed to smoke with configured groupings and an administrator-owned vocabulary. The replacement uses one `grouping-definitions` document and unified controls. Runtime contracts are documented in the [Studio README](../../plugins/studio/README.md) and [entity-service README](../../shell/entity-service/README.md); the earlier [collections](./studio-virtual-collections.md) and [vocabulary](./studio-grouping-vocabularies.md) plans identify the original rollout.

The implementation preserves exact Markdown memberships, opaque identities, paths, owner/plugin refinements, strays and historical duplicates. Labels, contributor types, cardinality and optional lists come from the document. Readiness and bounded reprojection remain process-local and ephemeral. There are no legacy readers, aliases, dual writes, automatic conversion or durable readiness records. Unknown configuration keys use ordinary strict-schema validation.

Create/update/delete default to administrator access, with publishing disabled. Explicit per-type instance permission rules can override action defaults under the shared permission service; this is not an unoverrideable administrator floor. Conversion must preserve applicable explicit rules without relaxation.

### Current validation

- Studio: 815 passing tests. Directory-sync: 820 passing tests. Normal commit hooks pass 96 lint, 104 typecheck and 102 test workspace tasks.
- The Studio visual/accessibility gate passes against unchanged baselines at the existing **0.2%** tolerance, using pinned Chrome and the documented Fontconfig settings.
- Fresh canonical publishing acceptance uses real HTTP authentication with isolated seeded sessions and mocked AI: 26 captures, including 25 desktop/phone accessibility and overflow checks across paper/instrument climates. It covers all four membership modes, administrator/trusted access, scoped counts, exact values and refused-save draft retention.
- A real uploaded image renders in preview without expanding authored memberships, unclaimed frontmatter or body references during save/export/import. Code examples cause no image reads. Definition policy remains literal in the database and exported Markdown after sync and restart. A new manual sync explicitly settles successfully after an interrupted run is retained as failed.
- Preview is rebuilt through the running app before inspecting managed `dist/site-preview`; hostname-routed preview and generated output are verified. Cold launcher-to-readiness time, including build, is **12.17 seconds**, below the **30-second** gate.
- Production activation is `fb6d178aeb`; ordinary configuration validation is `d57cd4dca6`; raw editor reads and scoped image previews are `d9925ab938`; raw durable exports are `48b29ff5ff`; ordinary System saves with intact Groupings draft guards are `86e89377bb`.

Local evidence is retained at `/tmp/studio-definitions-verified-qYH5IL/evidence.json`, `settled-sync-workspace.json` in that directory, and `/tmp/studio-save-visual-final.log`. The earlier failed fixture is retained separately rather than silently repaired. These results are not production migration acceptance. No smoke or existing demo accounts, passkeys or sessions were changed.

### Approved review artifacts

The approved [definitions page](../studio-grouping-definitions-mockups.html), [membership controls](../studio-grouping-editor-mockups.html), and [earlier control comparison](../studio-grouping-values-redesign-mockups.html) are frozen historical review artifacts. Their illustrative counts and “current/proposed” labels describe the review checkpoint, not the current runtime.

`plugins/studio/scripts/grouping-definition-mockups.tsx` and the historical comparison helpers are retained as review provenance, with the generator included in typechecking. The generator used the UI assets and component composition available at review time; running it against today's components/assets is a new rendering, not reproduction of an approved snapshot. Do not regenerate the approved HTML or visual baselines merely to make a check pass. The historical vocabulary editor/closed-field helpers are not mounted by production Studio.

## Remaining work

1. Review the one-time conversion contract and test cases below before implementing an operator conversion. Obtain separate authorization for access to current smoke state and for rehearsal/cutover.
2. Rehearse against an isolated, verified copy under a write/import/export fence, including matched rollback. Preserve the existing demo and every other brain.
3. Reconcile the replacement release with current mainline package metadata and consumed changesets. Do not manufacture version/lockfile churn or claim that a committed changeset is a release.
4. After authorization, perform only the reviewed smoke cutover, with fresh state capture and acceptance on the running app. No fleet or demo expansion is implied.

## Conversion contract

Each configured declaration becomes a definition under its **unchanged key**, retaining its label and contributor types. The key is also the frontmatter field; a key/field mismatch must stop conversion rather than rename content.

A matching vocabulary supplies `multiple` and its exact ordered `values`. A declaration without a vocabulary becomes `multiple: true` with no `values`, preserving open multi-valued behavior. Do not infer a closed list from observed memberships. Preserve literal commas, whitespace, image-looking text and values such as `Ka21` without trimming, splitting or cleanup.

The target is the fixed, shared, bodyless `grouping-definitions` singleton, with at most 20 definitions. `multiple` is independent of an optional nonempty, unique list of exact nonempty strings. The control document cannot contribute to itself. Existing memberships outside a list remain stored and visible; changing definitions does not rewrite them.

Refuse malformed or orphaned vocabulary entries, unknown/conflicting contributors or fields, changed source revisions and conflicting target definitions. Carry applicable explicit `grouping-vocabulary` permission rules to `grouping-definitions` without relaxation, refusing conflicting target rules. A repeat against an already-converted state must be a no-op, not overwrite later administrator edits.

Source-owned definitions require full Markdown replacement through supported tools, not a `fields` update that cannot persist. The title-derived create-tool ID requires the title `Grouping definitions` to produce `grouping-definitions`.

### Required conversion tests

- Open declarations retain multi-valued behavior. Closed declarations retain exact values, ordering and cardinality, including edits made since the original deployment.
- Memberships, source content, entity identities and paths remain unchanged. Existing strays and historical duplicates remain readable and marked.
- Invalid/ambiguous input, changed revisions, conflicting definitions and conflicting explicit permission rules stop without partial writes.
- Repeating a completed conversion does not overwrite subsequent administrator changes.
- Definitions are imported and reprojection is ready before normal writes resume. Retired vocabulary cannot return through import or pending exports.
- Rollback restores the matching runtime, desired state, content and database, including queued work and export state. Exact restores remain fenced until restart/rescan completes; identical row timestamps are not an edit-history signal.

## One-time smoke procedure

1. **Capture current state.** Inspect current operator-owned declarations, live vocabulary, applicable per-type permissions and source memberships, including unexported changes. Record revisions/hashes and the deployed image/configuration. The original deployment snapshot is not current user intent. Pause normal writes and background import/export, and take a fresh verified content/database backup including queued work and export state. Keep existing accounts, passkeys and sessions intact.
2. **Produce a reviewable conversion.** Apply only the contract above. Stop for explicit repair rather than silently dropping invalid entries or moving content. Record the proposed diff, source revisions, target revisions and idempotence result before any cutover.
3. **Switch configuration and content together.** Change smoke's desired-state source in `rover-pilot/users/smoke.yaml`; CI regenerates `users/smoke/brain.yaml`, not an operator hand-edit. Remove configured declarations, carry reviewed permission rules, and write shared definitions. Retire vocabulary through the supported entity/export lifecycle; archive it outside the import tree and prevent pending-export resurrection. Deploy the matching replacement runtime under the fence. Do not start it with rejected configuration or admit writes before import and reprojection are ready.
4. **Verify on the running app.** Compare labels, types, rules and exact memberships with the reviewed conversion. Compare catalog counts under the same access scopes. Exercise administrator and trusted-editor views, all four membership modes, a stray and a refused save that retains its draft. Include existing-image literals and exact source export/import checks. Trigger preview rebuilding through the running app before inspecting managed preview output. Health alone is not acceptance. Resume normal writes only after these checks pass.
5. **Retain a matched rollback.** On failure, keep writes paused and restore the previous runtime together with matching desired state, content, database, queued work and export state. Never downgrade only the image or restore stale data over newer work. Restart/rescan under the fence. Record backup, conversion diff, verification results and rollback instructions before closing the pilot.

## Boundaries and closure

No runtime compatibility paths, automatic startup migration, bulk key renaming, membership rewriting, inferred memberships, per-grouping grants, hierarchical groupings, cross-process push or durable readiness coordination are introduced. Conversion is a separately reviewed operator action, not a second runtime source of truth.

Close this plan only when the replacement release and authorized smoke conversion preserve current definitions and memberships, pass running-app acceptance, and have verified rollback. Preserve the 30-second startup and 0.2% visual gates. Other brains and the existing demo remain outside this cutover.

After shipment, record the durable contract and release outcome in implementation documentation and release notes, remove this plan from the roadmap, and retire it under the [planning cleanup policy](./README.md).
