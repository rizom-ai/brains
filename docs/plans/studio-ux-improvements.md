# Plan: Studio UX follow-through

Last updated: 2026-09-14

## Status

Two reviewed UX batches shipped in `@rizom/brain@0.2.0-alpha.368` and `0.2.0-alpha.371`. They delivered recovery-oriented Chat behavior, URL-backed collection navigation, server-side entity/session search, validation and upload recovery, readable Markdown/code/tables, unified page-head/action/typography geometry, responsive working context, and automated visual/accessibility coverage.

Those outcomes are now maintained in Studio/Web Chat tests, package changelogs, and [`plugins/studio/README.md`](../../plugins/studio/README.md). This plan retains only the deferred decisions and reviewed gaps below; completed checkpoint logs were removed.

None of the remaining items gates stable `v0.2.0` unless a release-candidate acceptance run exposes it as a concrete regression.

## Remaining presentation work

- **Collapsed rail identity.** Replace ordinal-only collapsed navigation with glanceable per-area marks while preserving accessible names.
- **Site-link emphasis.** Make preview/live-site launch links read as actions consistently with Overview launches.
- **Publishing totals.** Move the orphaned published total into the tab row or page-head metadata.
- **People language.** Replace internal Anchor vocabulary with user-facing protection/status copy and show the same connected-channel line for every person.
- **Collection grammar.** Unify library and Chat search, filter, range, and pagination presentation without merging their backend query semantics.
- **Time presentation.** Define where relative and absolute timestamps belong and fix singular relative-time copy.

Each change should reuse the shared React/StyleX control and typography contracts. Do not create per-workspace variants for shared semantics.

## Remaining acceptance work

1. Run canonical app-managed Studio smoke checks against the release candidate, including real routing, assets, auth, save/reload, Chat, and representative operator workspaces.
2. Complete manual accessibility verification for screen-reader announcements, focus order/restoration, obscured content, contrast cases that axe marks incomplete, and dialog background isolation.
3. Review desktop, tablet, and phone captures in both climates after the remaining presentation changes. Do not refresh baselines merely to hide host font or antialiasing drift.

## Separate decision: draft recovery

Opt-in browser draft persistence remains blocked on an explicit privacy and lifecycle decision. Before implementation, settle:

- which fields/content may persist and whether secrets are excluded structurally;
- storage location and per-person/per-brain isolation;
- retention, expiry, logout, successful-save, and explicit-clear behavior;
- conflict and schema-version behavior after upgrades; and
- whether recovery is local-only or needs any cross-device contract.

Until then, drafts remain in memory only. Do not infer approval from the shipped recovery work.

## Boundaries

- Keep Studio's editorial language and shared page grammar; this is follow-through, not another redesign.
- Preserve URL-backed collection/session state, permission-scoped server queries, and source-owned titles.
- Do not move authorization, persistence, search, or entity hierarchy into browser components.
- Structured folder navigation is separate and tracked in [studio-hierarchical-entity-navigation.md](./studio-hierarchical-entity-navigation.md).
- Public guest Chat policy remains in [public-ask.md](./public-ask.md).

## Validation

Use the lightest relevant checks first:

- affected Studio/shared-renderer unit and mounted UI tests;
- affected workspace typecheck and lint;
- focused browser interaction/layout checks;
- the non-update visual and axe matrix after approved presentation changes; and
- canonical running-app verification before declaring the plan complete.

## Completion

Delete this plan when the reviewed presentation list and manual/canonical acceptance checks are complete, or split draft recovery into its own approved plan if it remains the only open item.
