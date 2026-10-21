# Plan: Studio UX follow-through

Last updated: 2026-10-16

## Status

Three reviewed UX batches have shipped: the first two in `@rizom/brain@0.2.0-alpha.368` and `0.2.0-alpha.371`, and the presentation batch (PR #264) in `0.2.0-alpha.385`. Their outcomes are maintained in Studio/Web Chat tests, package changelogs, and the [Studio README](../../plugins/studio/README.md). Remaining: release-candidate verification with a working AI provider and configured site-launch URLs, manual accessibility verification, and the draft-recovery decision; drafts remain in memory only.

None of the remaining items gates stable `v0.2.0` unless a release-candidate acceptance run exposes it as a concrete regression.

## Presentation implementation

The presentation batch shipped in PR #264 (`0.2.0-alpha.385`):

- [x] Distinct collapsed rail marks with accessible names and preserved routing.
- [x] Properties width and unclipped native date/time controls and upload guidance.
- [x] Grouped site links rendered through shared outlined controls.
- [x] Actual published totals in the page head, without an orphaned body total.
- [x] User-facing protection language and connected-channel counts for every person.
- [x] Neutral disabled primary surfaces, including hover.
- [x] Shared collection search/filter/range/pager presentation with separate query semantics, truthful unknown totals, bounded filters, and keyboard dismissal.
- [x] Defined relative/absolute time policy, singular wording, and exact semantic timestamps.

No per-workspace variants or persistent drafts were introduced.

## Local acceptance evidence

- Reviewed 52 CI-native completion-batch captures across desktop, tablet, and phone in both climates, including 12 new open-filter captures. Unrelated host/font drift was not adopted.
- Canonical personal and publishing apps ran with isolated data, private Git remotes, and normal first-passkey authentication. Anonymous Studio API access returned 401.
- Verified explicit save/reload, unsaved-navigation cancellation, native invalid-field focus and save blocking, exact note restoration, bodyless form saving with sibling/body preservation, search/clear, semantic timestamps, People copy, and the real published count.
- Triggered the default preview build through the running Site workspace: 36 routes, succeeded. No production deployment or external launch URL was configured.
- Verified History/filter Escape handling and retained drafts. An invalid-provider-key probe exposed disappearing agent-error text; the fix adds explicit failure metadata and sanitized stream errors. The authenticated retest retained the failure and restored the request for review with zero retry POSTs.

## Remaining acceptance work

1. Complete release-candidate verification with a working AI provider and configured site-launch URLs. Placeholder credentials exercise failure recovery, not successful AI turns; local QA is not deployed-fleet acceptance.
2. Complete manual accessibility verification for screen-reader announcements, focus order/restoration, obscured content, contrast cases that axe marks incomplete, and dialog background isolation.

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
- Structured folder navigation has shipped; see the [Studio README](../../plugins/studio/README.md). Cross-type, metadata-derived grouping is separate and tracked in [studio-grouping-definitions.md](./studio-grouping-definitions.md).
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
