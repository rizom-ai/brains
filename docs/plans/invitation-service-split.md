# Invitation service split

**Active.** No slice has landed yet.

`shell/auth-service/src/invitation-service.ts` is 1327 lines, of which
`AuthInvitationService` is 1218 — one class holding creation, delivery,
interrupted-delivery recovery, manual confirmation, expiry reconciliation and
the read queries, behind nine public methods.

The existing tests are a real net: `auth-invitation-service.test.ts` is 620
lines and `invitation-delivery-supervisor.test.ts` another 78. They must pass
unchanged at every slice.

## Why it is worth doing

This is the surface that decides whether a person can be invited into a brain,
and its delicate parts are all about **doing something exactly once** —
creating one invitation per idempotency key, delivering it once, recovering a
delivery that was interrupted without sending a second one, confirming a manual
delivery once. Those rules are correct today and are spread across a class
large enough that the next reader has to hold all of it at once to be sure.

## Decisions

1. **The coalescing primitive moves to `@brains/utils` first.** Three methods
   here implement the same single-flight: a second call while one is in flight
   joins it rather than starting another. It is not the same as the existing
   `SerialQueue`, which admits every call in order and runs each one; this
   coalesces so the work happens once. Both belong in
   `shared/utils/src/serial-queue.ts`, whose subject is already async critical
   sections.
2. **Behaviour-preserving slices, tests before each extraction**, with the 698
   lines of existing tests passing unchanged throughout.
3. **No change to the public surface.** The nine public methods keep their
   names, signatures and semantics; this is internal structure only. Anything
   that would change what a caller sees stops and gets raised instead.
4. **Audit calls stay where they are.** Every state change writes to
   `AuthAuditStore`. Moving those between slices would make the audit trail
   hard to review, so each extracted module keeps writing the same audit
   records at the same points.

## Slices

Each slice is one PR.

1. **`singleFlight`.** Extract the in-flight coalescing into `@brains/utils`
   and use it at all three sites. Tests: a second call joins the first and the
   work runs once; the slot is released after it settles, including on
   rejection; a later call's entry is not removed by an earlier one's
   completion — the identity check that makes this safe.
2. **Delivery.** `deliver`, `deliverWithProvider`, `ensureDeliveryModeAvailable`,
   `validateDeliverySubject`, `deliveryAvailable`, `getInvitationDelivery` and
   the two provider lookups. Tests: an unavailable provider refuses delivery
   without recording an attempt; a subject the channel rejects is refused
   before any send.
3. **Recovery.** `recoverInterruptedDeliveries`, its internal, and
   `recoverInterruptedDelivery`, with the stale-delivery window. Tests: a
   delivery younger than the window is left alone; an interrupted one is
   recovered exactly once.
4. **Creation.** `createOrReplay`, `createDurableInvitation`,
   `getByIdempotencyKey`. Tests: the same idempotency key replays the first
   invitation rather than creating a second.
5. **Queries and lifecycle.** `list`, `listWithCurrentSetupExpirations`,
   `listDeliveryAttempts`, `reconcileExpired`, `requireInvitation`, `cancel`.
6. **Compose.** `AuthInvitationService` becomes the nine public methods
   delegating to the modules that own their state.

## Validation

- Per slice: `turbo run test --filter @brains/auth-service`,
  `turbo run typecheck --filter @brains/auth-service`,
  `bun scripts/lint.mjs --force --filter @brains/auth-service`, both format
  lanes, `bun run changeset:check`.
- The 620-line invitation service suite and the 78-line supervisor suite pass
  unchanged at every slice.
- After slice 6: no single unit in `invitation-service.ts` exceeds roughly 200
  lines, and the nine public signatures are byte-identical to what they are
  today. No claim is made about other files in `shell/auth-service`; they were
  not in scope.

## Related

- `shared/utils/src/serial-queue.ts` gains the coalescing primitive in slice 1
  and is the reference for how these are documented and tested.
