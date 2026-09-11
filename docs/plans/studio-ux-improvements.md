# Plan: Studio UX improvements

## Status

The recommended first batch is implemented on `feat/studio-ux-recovery` in the isolated `studio-ux-recovery` worktree. The user also approved increasing collection pages to 25 entries and addressing missing pagination controls. Remaining inventory is proposed, not approved scope. Based on current Studio code and inspected screens, not a complete usability study.

### Implementation notes

- Chat follows output only near the bottom, including content resizes; **Jump to latest** resumes following. Drafts remain in memory only.
- Failed reads expose scoped Retry controls without replaying writes. Cached content, navigation, and open drafts remain available where already loaded.
- Save feedback leads with plain-language status; expandable **Sync details** remain available at every viewport. Saved means stored in this Brain, not necessarily exported or synchronized remotely.
- Conflict comparison independently reads the saved version, preserves a lossless properties/body rescue copy, handles unavailable clipboard access, and requires confirmation before replacing the draft. Failed reads never replace it.
- Pagination is now above the records and remains visible for nonempty collections, including single-page collections. This removes the previous below-the-list placement and conditional hiding; the exact cause of the user's live missing-controls report has not been reproduced against their collection.

### Validation progress

- Studio unit/component tests, typecheck, repository lint wrapper, and UI build pass.
- Reviewed intentional visual changes in both climates; refreshed 18 affected baselines. Library, editor, conflict, delete, validation, and upload checks cover desktop/tablet/phone where defined.
- Browser regression coverage exercises page navigation, diagnostics disclosure, conflict comparison/cancel, and focus restoration. Behavior tests cover scroll-follow, history retry without sends, retained content on read errors, save labels, and conflict read/copy failure recovery.
- Chat snapshots retain the pre-existing paper differences (2.99%, 3.74%, 4.84%); they were not refreshed to conceal that unrelated baseline issue.
- Still pending: canonical running-app smoke test of this worktree and manual screen-reader verification. Main checkout and its running preview have not been switched to this branch.

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
