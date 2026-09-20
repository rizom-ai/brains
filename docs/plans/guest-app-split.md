# Guest Ask container split

**Active.** No slice has landed yet.

`interfaces/web-chat/ui-react/src/GuestApp.tsx` is 801 lines, of which one
component is 747 — the most concentrated unit in the repository. It holds
fourteen pieces of state, seven refs, three effects, six async operations and
two complete renders.

This is the same shape as the Studio Chat workspace, which went from 1131 lines
to 693 across eight hooks with every existing test passing unchanged. The same
method applies: presentation first, then one hook per concern, behaviour
preserved, one slice per PR.

## Why it is worth doing

`GuestApp` is the public visitor surface. Its operations encode a careful
protocol about what may be resent and what may not — a submission with no
conversation locator can never be retried, a guest receipt restores rather than
replays, and a failed history check is inconclusive rather than permission to
send again. Those rules are correct today and are stated in comments, but they
are spread through a 144-line `send` and a 59-line `checkBoxHistory` where the
next reader has to reconstruct them.

Giving each rule an owner and a test makes it hard to lose accidentally.

## Decisions

1. **Presentation first.** The full-page render moves before any state does, so
   later slices touch logic against a stable render.
2. **The lock stays a single ref, owned by a gate.** `lock.current` is the
   mutual-exclusion flag across send, restore, delete, history check and
   session re-open. Splitting it per hook would break the invariant it exists
   for. `useGuestGate` owns it and hands each operation a `run()` wrapper, so
   every later hook takes the gate as an input rather than holding a lock.
3. **One hook per concern**, each in its own file, exporting its input and
   output types.
4. **Storage stays best-effort and transcript-free.** Both locator helpers
   already swallow storage failures by design; a disabled `sessionStorage` must
   keep the app working and must never cause transcript text to be persisted.
   The hook keeps that contract and a test pins it.
5. **Two render modes stay two renders in the component.** `GuestApp` chooses
   between the box and the page. That choice is composition, not a concern to
   extract.
6. **Behaviour-preserving slices, tests before the hook.** The 28 existing
   tests must pass unchanged at every slice.

## Slices

Each slice is one PR.

1. **Presentation.** Move the full-page render — the conversation menu, the
   delete confirmation, the empty and unavailable states, the status line and
   the composer — into `GuestPage.tsx`. JSX unchanged.
2. **`useGuestGate`.** The mutual-exclusion lock, `busy`, `status`, `boxState`
   and `boxNotice`. Tests: a second operation is refused while one holds the
   lock; the lock is released on a thrown operation; a status set after unmount
   is dropped.
3. **`useGuestConversations`.** The locator and the saved list: `savedLocator`,
   `savedConversations`, `remember`, `conversations`, `id`. Tests: disabled
   storage degrades without throwing and persists no transcript; a deleted
   locator leaves the list; only well-formed guest ids are kept.
4. **`useGuestSession`.** Opening and re-opening the browser session, `session`,
   `expired`, availability. Tests: an unavailable session denies sending and
   keeps the draft; a fresh session clears the local selection without
   deleting or replaying anything.
5. **`useGuestTranscript`.** `messages`, `earlier`, `restore`, the boot history
   load and the follow-scroll. Tests: restoring an unavailable locator leaves
   the visible transcript unchanged; history ending on a user turn reports
   incomplete rather than complete.
6. **`useGuestSend`.** `send`, `pending`, the `AbortController` and the receipt
   protocol. Tests: a submission with no locator reports uncertain and is never
   retried; a guest receipt restores rather than resends; a 429 reports the
   limit and retries nothing; stopping reports that remote work may continue.
7. **`useGuestHistoryCheck`, then compose.** The confirm-without-replay rule,
   deletion, and the final composition. Tests: message count and text never
   confirm a submission; only an exact receipt or a stable restored message id
   does.

## Validation

- Per slice: `turbo run test --filter @brains/web-chat`,
  `turbo run typecheck --filter @brains/web-chat`,
  `bun scripts/lint.mjs --force --filter @brains/web-chat`, both format lanes,
  `bun run changeset:check`.
- After slice 7: `GuestApp` is composition and two renders, and no file in
  `interfaces/web-chat/ui-react/src` exceeds 500 lines except the generated
  `ai-elements/` vendor components.
- The 28 existing `guest-app.test.tsx` tests pass unchanged throughout.

## Related

- [public-ask.md](./public-ask.md) owns the visitor acceptance work this
  refactor must not change the behaviour of.
