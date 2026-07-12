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

1. **Chat dynamic states**
   - Extend the deterministic fixture conversation with entity/tool cards, attachments,
     save-quote modules, and progress states.
   - Review all target viewports and both climates against the approved visual system.
   - Commit the reviewed baselines.
2. **CMS rich colophon states**
   - Extend the fixture schema beyond title + summary to include select, tags, toggle,
     date, and cover-image fields.
   - Cover tall tablet colophons and secondary editor states without document-level
     overflow.
   - Review and commit the baselines at 1440×1000, 768×1024, and 390×844.
3. **Closeout**
   - Run the targeted console-theme, dashboard, web-chat, and CMS checks.
   - Smoke the authenticated Rover full app.
   - Merge, release the pending changeset, then delete this plan.

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
