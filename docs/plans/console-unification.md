# Plan: Console dynamic-state fidelity tail

## Status

Active on `work/console-responsive`. The shared console theme, strip, command palette,
responsive composition, CMS/Chat/Dashboard visual-fidelity pass, reviewed screenshot
baselines, and release shipped on 2026-07-12.

This file tracks only the remaining baseline gaps. Delete it when they merge and release.

## Goal

Pin the dynamic states that the approved default-state baselines do not exercise, so later
console changes cannot silently regress the richest chat and CMS compositions.

## Remaining work

1. ~~**Chat dynamic states and composer closeout**~~ — done 2026-07-12. The `chat-cards`
   fixture pins sources/actions/attachment cards and the upload chip; the composer is
   the attach/message/send pill at every width (desktop boxed card removed, hint chips
   dropped, `aria-label` preserved). Two further chat scenarios pinned the same day:
   `chat-empty` (rhizome empty state, restored by removing the guided playbook starter)
   and `chat-drawer` (open drawer at 390 with the repositioned close button). Progress
   parts are stream-only and remain live-only.
2. ~~**CMS rich colophon states**~~ — done 2026-07-12. Fixture schema carries the full
   mockup colophon; both publication chip states pinned; fixed the 641–900px editor grid
   that pushed the save bar off-viewport under a tall colophon. Secondary states
   (validation, conflict, delete, media upload) render as overlays and get dedicated
   captures only if pinning them becomes worthwhile.
3. **Closeout**
   - ~~Run the targeted console-theme, dashboard, web-chat, and CMS checks.~~
   - ~~Smoke the authenticated Rover full app.~~ (operator live review, 2026-07-12)
   - Merge, release the pending changesets, then delete this plan.

## Non-goals

- Redesigning the approved shared chrome or climate system.
- Reopening dashboard information architecture, chat session behavior, or CMS editing
  behavior.
- Adding new dynamic-state features solely to make a fixture more interesting.

## Verification

- Dynamic chat shapes render in deterministic fixtures in paper and instrument climates.
- Rich CMS fields render at desktop, tablet, and phone sizes with no horizontal overflow;
  tall tablet colophons scroll inside the editor rail.
- Screenshot changes receive explicit human review rather than automatic baseline updates.
- The authenticated Rover full app matches the fixture behavior.
- Targeted typecheck, lint, and tests pass for `@brains/console-theme`,
  `@brains/dashboard`, `@brains/web-chat`, and `@brains/cms`.

## References

- [`docs/console-responsive-mockups.html`](../console-responsive-mockups.html)
- [`docs/cms-editor-mockups.html`](../cms-editor-mockups.html)
- [`docs/console-unification-mockups.html`](../console-unification-mockups.html)
