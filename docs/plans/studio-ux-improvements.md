# Plan: Studio UX improvements

## Status

The first batch and 25-entry pagination shipped in `@rizom/brain@0.2.0-alpha.368`. The user approved completing the remaining plan in one worktree: `studio-ux-completion`, branch `feat/studio-ux-completion`. The user requested merging the implemented portion of this second batch; upstream reconciliation and release verification are underway. The unchecked items below remain deferred, not completed. Draft persistence still requires an explicit privacy/retention decision.

### Completion worktree checklist

- [x] Distinguish stopped, disconnected, and failed responses; preserve partial output. Retry preparation restores the request only into an empty composer and sends nothing automatically.
- [x] URL-backed collection offsets, Back/Forward navigation, and return from the editor.
- [x] Heading-derived read-only document labels without modifying content or frontmatter.
- [x] Content-first entry for raw documents on phones; remember manually selected panes within the mounted app.
- [x] Ctrl/Cmd+S through native form validation; expose Save and Chat keyboard guidance.
- [x] Per-file Chat upload status and explicit retry; retain successes when other files fail, guard late results after session changes, and show supported-file limits.
- [x] Server-backed title/content search, exact visibility and projected-status filters, created/updated sorting with an ID tie-breaker, filtered counts, and URL-backed filter state. Search/filter changes reset paging; editor return and Back/Forward preserve the complete query.
- [x] Server-backed session search across titles/messages, paginated active/archived lists, and explicit rename with failure recovery. Filtering happens before pagination and preserves person/interface access boundaries.
- [x] Field-level server validation with accessible descriptions, first-invalid-field focus, and a bounded error summary for unmapped/read-only fields. Native validation reveals Properties before focusing hidden phone inputs; late save responses cannot affect another record.
- [x] Editor image-upload recovery: retain failed files for explicit retry/dismiss, preserve the previous reference, prevent duplicate upload starts, announce progress/completion, explain file limits and save requirements, and ignore late reference updates after record switches.
- [x] Local, bounded syntax highlighting for JS/TS/JSX/TSX, JSON, HTML, and CSS, with intact copy text and plain-text fallback. Tables retain alignment, use column-header semantics and alternating rows, and wrap long content. Both code and table overflow regions support keyboard scrolling with visible focus.
- [x] Distinguish empty/filtered collections, unavailable destinations, expired sessions, denied reads, throttling, and ordinary read failures. Recovery remains explicit and read-only; unavailable initial destinations offer a return to Studio instead of masquerading as an empty account.
- [x] Automated WCAG audit and keyboard checks across the Studio fixture matrix; skip-to-content, main landmarks, linked editor tabs/panels, focusable reading regions, dialog focus wrapping, and readable text/focus treatments including portals.
- [ ] Complete the responsive/presentation and cross-surface consistency checklists below.
- [ ] Manual accessibility verification (including screen-reader announcements and axe incomplete findings) and canonical running-app smoke testing.
- [ ] Opt-in draft recovery: agree on privacy, storage, retention, and clearing behavior before implementation.

Checked items are implemented and fixture-verified, not released. The core changeset tracks the implemented portion; the remaining presentation work and manual checks are still open.

Accessibility checkpoint: 116 Studio captures across desktop/tablet/phone and both climates report zero axe violations against WCAG 2/2.1/2.2 A/AA tags. Native keyboard checks cover skipping navigation, reaching visible content controls, dialog Tab/Shift-Tab wrapping, and Chat PageUp scrolling. The harness restores independent scroll regions after keyboard checks. Reviewed 110 changed baselines were refreshed for this checkpoint, not as a claim that the presentation checklist is finished. Axe incomplete results remain recorded for manual review, including symbol/gradient/obscured-content contrast and modal background/focus-guard isolation. The subsequent non-update visual run passes all 116 captures. Full repository typecheck (102 tasks), affected-workspace lint, and 1,899 tests across eight affected workspaces pass (Studio: 382 tests, 1,742 assertions).

Markdown work has tokenizer preservation/fallback tests and rendered safety/table-semantics coverage across document, Chat, and assist presentations. Desktop/tablet/phone browser checks in both climates verify exact code copying, native horizontal keyboard scrolling, and at least 4.5:1 contrast for rendered syntax tokens. Reviewed preview captures are in the visual artifacts; affected baselines were refreshed at the accessibility checkpoint. Read-state tests cover distinct HTTP recovery guidance, unavailable-route return, and GET-only retries that recover into an honest empty state. That checkpoint passed 382 Studio tests.

Validation/upload work has mounted UI tests for field association and focus, unmapped errors, explicit retry, duplicate upload prevention, late uploads, and late successful/failed saves after record switches. Desktop/phone browser checks exercise server validation from Source, native validation from Preview, and failed image upload recovery before a pending upload. Interaction/layout assertions pass; reviewed screenshots are covered by the accessibility checkpoint baseline refresh. This implementation checkpoint originally passed 359 Studio tests.

Library work has real-database count/filter/visibility tests, HTTP query validation and ordering tests, query-cache isolation tests, and URL/editor-return coverage. Browser checks exercise search from a later page, empty filtered results, clearing filters, and Back/Forward at desktop/tablet/phone widths. Counts and rows share the same server-side predicates; exact visibility never widens the access scope. The library screenshots were reviewed and refreshed at the accessibility checkpoint.

Session work has targeted contract, real-database, HTTP permission/query, and UI regression coverage. Desktop/tablet/phone browser checks exercise rename; phone checks also exercise search, archived access, and picker focus restoration. Layout assertions pass. Screenshots were reviewed and refreshed at the accessibility checkpoint; remaining presentation changes will need another review.

### Responsive and presentation review

Findings from a Chromium review of released `main` at 1440×1000, 768×1024, and 390×844 in
both climates. They belong to the open responsive-review item above. Ctrl/Cmd+S, collection
search and filters, field-level validation, and upload limits are already covered by the
checked items and are excluded.

- [x] **Tag placeholder clips mid-glyph.** `tagInput` in `studio-fields.styles.ts` is 58px
      wide; "Add tag" needs about 64px at the desktop 12px size and renders at 16px in the
      same box on phones. Size the field in font-relative units so placeholder and caret fit
      at both sizes.
- [x] **Phone-only Sessions trigger renders on desktop.** `.studio-chat-mobile-sessions` in
      `studio-chat-workspace.tsx` carries no declaration since the StyleX migration, so the
      trigger sits beside the session rail it replaces. The rail hides at 860px; give the
      trigger the inverse breakpoint.
- [x] **Phone Chat working set squeezes the thread.** An open **Working set** takes
      `min(200px, 20dvh)` above a thread that then shows about two turns. Sessions already
      opens a dialog at phone width; give the working set the same treatment instead of a
      second stacked panel.
- [x] **Overview occupies a leaf column for one duplicate link.** `leafOpen` in
      `entity-fields.tsx` includes `overview`, so the leaf renders a single destination that
      repeats the rail item beside it. Chat and Administration are direct destinations
      without a leaf; Overview is one too.
- [ ] **Collapsed rail carries no identity.** The 68px strip shows ordinals `00`–`05` with
      names only in `title`/`aria-label`. Render a glanceable per-area mark in the ordinal
      slot while collapsed, keeping the accessible names unchanged.
- [x] **Save changes reads as actionable when clean.** The document-header action is a
      filled primary whether or not the draft is dirty, leaving the footer text as the only
      dirty signal. Reserve the filled treatment for unsaved changes and keep a quieter
      variant otherwise; no-op saves stay available.
- [ ] **Properties column truncates its own fields.** The column is
      `clamp(230px, 20vw, 280px)`, about 215px of content after padding and the scrollbar.
      The `datetime-local` value renders at the shared 16px control size and truncates
      ("07/14/2026, 09:0("), and the upload format note wraps onto two lines. Widen the
      column and set the date control to a size that fits.
- [ ] **Site links do not read as actionable.** `links` blocks render with quiet emphasis, so
      **Open preview** and **Open live site** look like labels beside the real **Build
      preview** button. Overview's launch links already use accent with a trailing arrow;
      apply the same emphasis.
- [ ] **Publishing totals sit in an orphaned row.** "Published 14" renders as a half-width
      key-value row below the queue. Move it into the tab row or the page-head metadata.
- [ ] **Administration People states internal vocabulary.** Roster metadata in
      `people-workspace.ts` reads "Protected brain identity" for the Anchor and "Not the
      Anchor" for yourself, the latter replacing the channel count everyone else gets. State
      the protection as "Always an active Admin · cannot be suspended" and give every person
      the same channel line, including "No connected channels" for nobody attached.
      `plugins/admin/test/people-workspace.test.ts` pins the current strings and changes with
      them.
- [ ] **Disabled primaries keep their accent fill.** The shared button applies
      `opacity: 0.5` to a disabled primary, so Chat's **Send** with an empty composer still
      reads as a live control on dark. Give the disabled primary a neutral surface in
      `shared/app-ui-react/src/controls.tsx` rather than a dimmed accent.

Baseline state observed during this review: 126 of 202 committed console baselines differ
from local captures of unmodified `main`, while the dashboard set is pixel-identical, so the
difference is not machine or font drift. The `studio-editor` baselines still show the
pre-gap `committedlast write` pipeline strip that current code no longer produces. The
release baseline refresh this plan already defers needs to cover the whole set, not only the
surfaces this worktree changes.

### Cross-surface consistency

Measured from Chromium captures of this worktree at 1440×1000, 768×1024, and 390×844 in both
climates. These are shared-treatment divergences rather than per-surface defects, so the
first two change the most screens and are worth sequencing before the per-surface items
above.

- [x] **The page head has three geometries and two dividers.** At 1440, with the content pane
      starting at x=344, the title lands at x=374 in the library, x=380 in every declarative
      workspace, and x=400 in the editor; its top edge sits 10px higher in the library than
      in a workspace. Three independent paddings own this: `library.listing` at
      `26px 30px 34px`, `workspaceStyles.surface` at `36px 36px 48px`, and `editorStyles.head`
      at `25px 28px 17px` inside a `layout.head` margin of `18px 26px`. Phone diverges the
      same way (`12px 16px` against `24px 20px`). The rule below the title is also two
      objects: 2px `--console-text` inset to the content column on every workspace, 1px
      `--console-rule-strong` full-bleed over a `--console-frame` band in the editor. Give the
      shared page head one inset scale and one divider, and let surfaces vary content rather
      than geometry.
- [x] **The head's single action carries three weights.** The library's **New field note** and
      the editor's **Save changes** render as filled accent, Content sync's **Sync now** as
      `secondary`, and Chat's **Sessions**/**New conversation** as `outline`. Declarative
      workspaces cannot render anything else: `actionVariant()` in
      `operator-view-renderer.tsx` returns `secondary` for every non-subordinate action. Decide
      one treatment for a page-head primary action and map the declarative path onto it.
- [ ] **Collection search is built twice.** The library labels the field "Search title or
      content", submits through an explicit **Search** button, and hides filters behind a
      **Filter and sort** disclosure. Chat labels it "Search conversations", carries
      placeholder-only guidance, submits without a button, and exposes its `Show` select
      inline. Result ranges disagree too: `1–25 of 54` top-right in the library,
      `Showing 1–3 of 3` bottom-left in Inbox, and bare **Previous**/**Next** top-left in
      Chat. Settle one search-and-range grammar and apply it to both collections.
- [x] **Section headings use three weights.** The same UI/14px heading is 700 in declarative
      workspaces (`--operator-section-weight`), 650 in Account, and 600 in Chat. Pick one.
- [x] **Display titles use three sizes.** The page head is 36px/600, the editor document title
      38px/500, and the Chat conversation title and Account name 24px; phone renders 29px
      against 27px. Reduce these to a stated display scale, keeping a deliberate document
      variant only if the editor needs one.
- [x] **The uppercase mono micro-label has no token.** Thirteen distinct specs exist across six
      style modules — sizes 8/9/10px, tracking .06em to .17em, weight unset/500/600/650 —
      covering "STUDIO", "CONTENT", "PROPERTIES", "DRAFT", and rendered table headers, which all
      read as one label class. Define one eyebrow token and consume it everywhere.
- [ ] **Timestamps use two systems.** Library rows are relative in the UI face through
      `formatUpdated`, turning absolute past fourteen days in the same face, while Overview
      activity, Publishing, Inbox, Content sync, Chat sessions, and Account sessions are
      absolute in mono. Choose one presentation per role and state where relative time is
      allowed. `formatUpdated` also renders "1 minutes ago" below two minutes while its hours
      branch handles the singular.

### Action-emphasis checkpoint

Page primaries now use the filled accent, including Chat and explicitly declared declarative workspace actions/disclosures. Confirmation actions retain danger styling; row and ordinary body actions remain subordinate. Clean Save uses outline without disabling no-op saves; dirty Save retains primary emphasis. The Sessions trigger hides beside the desktop rail but remains available when that rail is absent, preserving archived-session access. Tag input widths use font-relative units, with browser measurements protecting placeholder/caret room at both font sizes.

Verification: 384 Studio tests, 148 operator-view tests, and four shared-control tests pass; full repository typecheck (102 tasks) and scoped lint pass. Reviewed baseline updates pass the subsequent 116-capture Studio run and two additional desktop empty-Chat captures. All 118 audited captures report zero axe violations; incomplete findings and manual checks remain open. The remaining presentation/consistency items above are not completed by this checkpoint.

### Working-set checkpoint

At 860px and below, Working set opens a shared dialog instead of occupying conversation height. Desktop retains its inline disclosure. Context renders in only one presentation; changing sessions closes the dialog. Closing or resizing restores focus to the visible trigger/summary, including browsers that blur CSS-hidden controls before emitting media-query events. Composer drafts remain untouched.

Verification: 385 Studio tests (1,752 assertions), scoped typecheck, and lint pass. Browser checks verify unchanged thread height, retained draft text, single context rendering, dismissal focus, and both resize directions. Six reviewed Chat baselines were refreshed; all ten standard Chat captures pass the subsequent pixel and axe run in both climates. Shared page-head geometry and the other unchecked presentation items remain open.

### Heading-geometry checkpoint

Library, declarative workspaces, Account, Chat, and the editor now consume one shared heading inset scale: 36px top/inline on larger screens; 24px top and 20px inline on phones. Page titles share a level-one heading, 36px/600 (29px on phones), and an inset 2px text-colored divider. The editor's separate header band and duplicate title styles were removed. A shared title/action grid reserves the action's column; optional metadata yields space on phones, while collection totals remain available in the pager. Save stays pinned and source/preview/properties retain independent scrolling. Secondary display typography remains in the open consistency checklist.

Image review also caught shared logical input padding that the earlier tag-width check had missed. Tag inputs now override that padding explicitly, and browser checks measure usable content width rather than the padded input box.

Verification: 385 Studio tests (1,782 assertions), scoped typecheck, and lint pass. Native browser assertions cover both horizontal insets, top inset, title scale/semantics, divider, and action placement across all 116 standard Studio fixtures. After reviewing 38 changed baselines, the non-update Studio run and two desktop empty-Chat checks pass; all 118 audited captures report zero axe violations. Manual checks, remaining presentation work, and the privacy decision are still open.

### Typography checkpoint

The page-head scale remains 36px/600, or 29px on phones. `studio-typography.styles.ts` adds shared secondary-display titles at 24px/500 (1.2 leading, −.02em tracking), UI section headings at 14px/650, and uppercase mono eyebrows at 10px/600 with .12em tracking. Chat, Account, navigation, editor, publication, and rendered table labels consume these roles rather than maintaining separate specs. Hosted feature/section/compact-card and table headings use the same scale through generic renderer slots; other hosts retain their defaults. Unused label styles were removed. Authored Markdown headings and shared attention-callout controls keep their separate roles.

Verification: 388 Studio tests (1,932 assertions), 150 shared-renderer tests (2,099 assertions), full repository typecheck (102 tasks), and scoped lint pass. Compiled-style tests cover host overrides and renderer defaults; native checks verify actual title/section/eyebrow sizes, weights, tracking, and inherited card heading styles. All 118 captures were reviewed across both climates and three viewport sizes, including full-size editor/table details. After refreshing 79 changed baselines, the subsequent 116 standard plus two empty-Chat visual checks pass, with zero axe violations. Remaining presentation items, manual accessibility, running-app smoke tests, and draft-persistence approval remain open.

### Overview navigation checkpoint

Overview now uses the direct-destination rail, without reserving a leaf column or repeating its own destination. The unreachable Overview leaf markup was removed; area ordering, badges, access gating, and phone/tablet Browse remain intact.

Verification: 388 Studio tests (1,935 assertions), scoped typecheck, and repository-wrapper lint pass. Browser assertions protect the leaf-free structure and 124px expanded desktop rail. Both desktop captures were reviewed and refreshed; all six Overview viewport/climate captures pass the subsequent visual and axe checks with zero violations. The remaining navigation/presentation items and manual checks stay open.

### Implementation notes

- Chat follows output only near the bottom, including content resizes; **Jump to latest** resumes following. Drafts remain in memory only.
- Failed reads expose scoped Retry controls without replaying writes. Cached content, navigation, and open drafts remain available where already loaded.
- Save feedback leads with plain-language status; expandable **Sync details** remain available at every viewport. Saved means stored in this Brain, not necessarily exported or synchronized remotely.
- Conflict comparison independently reads the saved version, preserves a lossless properties/body rescue copy, handles unavailable clipboard access, and requires confirmation before replacing the draft. Failed reads never replace it.
- Pagination is now above the records and remains visible for nonempty collections, including single-page collections. This removes the previous below-the-list placement and conditional hiding; the exact cause of the user's live missing-controls report has not been reproduced against their collection.

### First-batch validation (historical)

- Studio unit/component tests, typecheck, repository lint wrapper, and UI build pass.
- Reviewed intentional visual changes in both climates; refreshed 18 affected baselines. Library, editor, conflict, delete, validation, and upload checks cover desktop/tablet/phone where defined.
- Browser regression coverage exercises page navigation, diagnostics disclosure, conflict comparison/cancel, and focus restoration. Behavior tests cover scroll-follow, history retry without sends, retained content on read errors, save labels, and conflict read/copy failure recovery.
- Chat snapshots retain the pre-existing paper differences (2.99%, 3.74%, 4.84%); they were not refreshed to conceal that unrelated baseline issue.
- Canonical running-app smoke testing and manual screen-reader verification remain pending. The user declined restarting the Personal preview while continuing implementation. Main and its preview are not being switched to the completion worktree.

## Goal

Improve clarity, recovery, and findability without redesigning Studio's editorial visual language. Support desktop, tablet, and mobile using existing shared controls, StyleX presentation, and plugin boundaries.

## Priority 1 — Prevent frustration and lost work

| Improvement                | Current gap                                                                                             | Proposed change                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Chat scrolling             | Every streamed text update scrolls to the bottom, including while reading earlier messages.             | Follow only when already near the bottom; otherwise show **Jump to latest**.                                 |
| Recoverable loading errors | Some library failures replace the Studio shell. Chat history failures lack dedicated recovery controls. | Preserve navigation and available content; show scoped error feedback with **Retry**.                        |
| Clear save status          | Technical pipeline terminology dominates feedback.                                                      | Lead with **Unsaved changes / Saving / Saved**; put database, file, and commit diagnostics in a disclosure.  |
| Conflict recovery          | Conflicting saves offer **Reload latest**, but no comparison or explicit draft rescue.                  | Offer **Compare changes** and **Copy my version** before replacing the draft.                                |
| Interrupted Chat responses | Partial responses survive Stop, but interruption and completion need clearer presentation.              | Distinguish **Stopped** from **Connection lost**; provide explicit retry without silently repeating actions. |

## Priority 2 — Make everyday tasks faster

| Improvement                    | Current gap                                                                        | Proposed change                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Library search and filters     | Collections paginate but lack collection-level search/filter controls.             | Add server-backed title search, visibility/status filters, and sorting.           |
| Restorable collection position | Pagination lives in component state rather than a shareable URL.                   | Preserve page/filter state through refresh, Back, and return from the editor.     |
| Chat session management        | Session list lacks search and rename controls.                                     | Add session search, title editing, and access to archived sessions.               |
| Better document titles         | Raw notes can appear under long entity IDs.                                        | Derive a display title from the first heading; retain the durable ID in details.  |
| Mobile editor entry point      | Phone editors initially open Properties, including raw notes with little metadata. | Test opening content first for raw notes and remembering the selected pane.       |
| Keyboard affordances           | Chat supports Enter/Shift+Enter without explaining it.                             | Show the shortcut hint; add discoverable Save and editor-mode shortcuts.          |
| Field-level validation         | Save errors are primarily general notices.                                         | Place actionable errors beside affected fields and focus the first invalid field. |

## Priority 3 — Polish and confidence

| Improvement                        | Proposed change                                                                                                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload feedback                    | Show per-file progress, failure/retry, supported formats, and size limits.                                                                                                   |
| Markdown readability               | Restore syntax highlighting in custom code blocks; review table alignment and narrow-screen overflow.                                                                        |
| Empty states                       | Distinguish no content, no matching results, insufficient permission, and loading failure.                                                                                   |
| Accessibility audit                | Verify keyboard navigation, focus restoration, screen-reader announcements, contrast, and touch targets across workspaces.                                                   |
| Draft recovery — decision required | Evaluate opt-in recovery after reload with explicit privacy and retention rules. Current drafts intentionally remain in memory; do not introduce silent browser persistence. |

## Recommended first batch

### 1. Chat scroll-follow behavior

- Follow new output only while the reader is near the bottom.
- Preserve the reader's position when scrolling upward during a response.
- Provide **Jump to latest** to return to the end and resume following.
- Verify on desktop, tablet, and phone, including long responses and changing content heights.

### 2. Inline errors with Retry

- Keep Studio navigation mounted when a collection or conversation request fails.
- Preserve available content and drafts; distinguish stale content from an empty result.
- Retry only the failed read. Never repeat mutations implicitly.
- Verify initial-load failures, background refresh failures, and recovery.

### 3. Plain-language save status

- Distinguish dirty, saving, saved, and failed states clearly.
- Define what **Saved** guarantees; do not imply file export or remote synchronization has completed before it has.
- Keep technical pipeline diagnostics accessible but secondary.
- Verify status changes after typing, successful saves, no-op saves, failures, and external updates.

### 4. Safer conflict recovery

- Preserve the local draft while loading the latest persisted version for comparison.
- Let the operator copy their version before choosing to replace it.
- Require explicit resolution rather than silently overwriting either version.
- Verify that failed comparison/reload requests leave the draft intact.

## Implementation approach

- Confirm scope before starting each batch.
- For changes to visual hierarchy or interaction patterns, review focused desktop/mobile mockups before implementation.
- Keep changes in the owning surface or shared package; use typed, schema-validated contracts when backend support is needed.
- Do not add speculative compatibility shims or broaden plugin responsibilities.
- Leave unrelated untracked documentation untouched.

## Validation

- Add behavior-focused regression tests for each change, including failure paths.
- Run relevant workspace tests, typechecks, and the repository's lint wrapper with the Studio filter.
- Review affected visual regressions at desktop, tablet, and phone widths in both climates. Update baselines only after reviewing intentional differences.
- Verify against the running canonical app, not static assets alone. If the selected posture includes site-builder, trigger the preview rebuild through the running app before inspecting generated site output. Personal posture currently has no site-builder capability.
- Complete keyboard and screen-reader checks for changed controls and announcements.
