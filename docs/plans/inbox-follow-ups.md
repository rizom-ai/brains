# Plan: Inbox follow-ups and the email-triage fold

## Status

**Proposed.** Builds directly on the shipped unified inbox (contract, CMS
workspace, digest — branch `feat/unified-inbox-surfaces`). Requires review
before implementation. UX mockup:
[inbox-follow-ups-mockup.html](./inbox-follow-ups-mockup.html).

## Goal

The inbox stops being a chore list and becomes a launch pad. Today every
affordance on an item is a resolution transition (mark reviewed, mark handled,
archive) — the only thing an operator can do with attention is dismiss it.
Different items must lead to different next activities: discuss a mail with
the brain, capture an idea as a note, draft a reply, review a candidate. At
the same time, the CMS stops presenting two open-attention surfaces: with one
source registered, the Inbox workspace and the default-new view of the Email
Triage workspace show the same arrivals with different chrome.

## What exists today (fact-check)

- The inbox contract (`shell/plugins/src/inbox-registry.ts`) gives every item
  `id`, content-safe `title`/`summary`, `receivedAt`, `urgency`, optional
  `entityRef`, and source-owned `actions`. Actions mutate source state through
  `act` and resolve items out of the projection.
- The Inbox workspace already renders **Open source entity** from `entityRef` —
  the only non-resolution affordance an item has.
- The Email Triage workspace (`EmailTriageWorkspace` renderer +
  `plugins/email-triage/src/operator-cms.ts`) defaults to new mail but also
  offers client-side category, priority, status, and needs-reply filters. It
  displays organization and requested-action fields and can mutate reviewed
  items after they have left the Inbox.
- The standard **Mail Items** CMS collection lists and opens every retained
  mail item, so it supplies chronological history and direct field inspection.
  It does **not** currently reproduce the desk's status-filter bar.
- The inbox source lists only `status: "new"` items
  (`plugins/email-triage/src/inbox-source.ts`) — the Inbox is open attention
  only, by design. It maps mail priority `low` to inbox urgency `normal`, so a
  separate mail-priority facet is required before the desk can be folded.
- The email-triage Dashboard summary currently combines new and reviewed mail
  in its high-priority, needs-reply, and unclassified counts. Those counts do
  not describe the new-only Inbox projection and cannot keep their current
  definitions when the widget retargets the Inbox.
- Mail items carry no operator-recognizable sender: `source.senderKey` is a
  hash and `organization` is optional, so the title must carry all context.
  The parsed inbound envelope already has a display name and the projection
  already derives a domain. A hashed `threadKey` exists in frontmatter but is
  not indexed metadata and has no bounded position lookup.
- The current IMAP `sourceRef` is a one-way SHA-256 hash of mailbox,
  UIDVALIDITY, and UID. The email interface stores no corresponding locator,
  so refs written before a locator store exists cannot be resolved on demand.
- [email-reply-drafting.md](./email-reply-drafting.md) requires a
  permission-checked email source-read operation. This plan owns that shared
  primitive in Phase 6; reply drafting consumes it rather than defining a
  second source-read contract.
- Web-chat has no composer-prefill handoff. Its mounted path is configurable,
  but it advertises the authoritative path as the `web-chat` interaction.
- The CMS has no URL-addressable create mode or create-with-prefill navigation
  target: `parseCmsPath` (`plugins/cms/src/cms-paths.ts`) recognizes home,
  collection, entity, and workspace paths only.
- The CMS container holds per-workspace request state (`workspaceQueries` in
  `plugins/cms/ui-react/src/App.tsx`) but never reads filter state from the URL.
  Current Inbox paging assumes an initial offset of zero; rehydrating a URL at
  `offset=50` would load page two alone and then request that same offset again.

## Core decisions

1. **Actions resolve; follow-ups launch.** Actions stay exactly as shipped:
   source-owned mutations, confirmation-gated, actor-carrying, and re-listing.
   Follow-ups are deliberately different: they navigate with item context,
   never mutate anything, and leave the item open. The inbox remains a
   stateless projection with no task state or business logic.

2. **Navigation uses registered, same-origin targets.** No plugin guesses
   another plugin's default route. Universal chat resolves the mounted
   `web-chat` interaction from `appInfo().interactions`. After CMS workspace
   registration returns the Inbox URL, unified-inbox advertises it through the
   existing interaction registry as the Admin-only `unified-inbox`
   interaction; it does not mutate the already-finalized inbox source
   registry. Source widgets resolve that interaction inside their data
   provider, not during `onReady`, so plugin ready order is irrelevant.
   Source-declared follow-ups are origin-relative paths from an authoritative
   registration/interaction. Registry normalization requires a leading single
   `/`, rejects `//`, URL schemes, backslashes, control characters, and paths
   over 2,048 characters. It parses against a sentinel origin and requires the
   normalized result to retain that origin before freezing the target. Missing
   targets hide the affordance.

3. **Universal follow-ups are derived by the surface.** Every item with an
   `entityRef` may receive these launches without source declarations:

   - **Open source entity** — exists today and remains access-checked by CMS.
   - **Discuss in chat** — opens the registered web-chat path with a bounded
     composer prefill: `About inbox item: <title> (<entityType>/<entityId>)`.
     Only the already content-safe title and reference enter the handoff; no
     summary or source body does. The composer is populated but never sent.
     Web-chat runs at the operator's permission and may resolve the restricted
     entity only after the operator submits the message.
   - **Capture as note** — appears only when the current actor can create the
     registered `note` entity. CMS gains the collision-free
     `/entities/<type>?mode=create` target (rather than reserving the valid
     entity ID `new`), but the Inbox targets `note` specifically. Title,
     summary, and the canonical
     `entity://<encoded-type>/<encoded-id>` backlink travel in same-origin
     router history state, not URL query parameters, server logs, or storage.
     A reload opens an empty draft; nothing persists until Save.

4. **Kind-specific follow-ups are source-declared safe links.** `InboxItem`
   gains `followUps?: { id, label, href }[]`, bounded and normalized by the
   same-origin target schema above. A source builds a target from a surface or
   interaction that actually registered, never from a hard-coded route. The
   first consumer is email-triage's **Draft reply** link on `needsReply` items:
   it appears only when an `email-reply-draft` interaction is available and
   adds the opaque mail-item ID as `mailItemId` through the URL API (never
   string concatenation) before revalidating the final same-origin path. Agent
   candidates and stale opportunities use the same field with their own
   registered targets.

5. **Facets are source-scoped.** `InboxItem` gains bounded
   `facets?: Record<string, string>`, and each source registration may declare
   at most eight facet definitions (key, label, and at most twenty allowed
   value/label pairs). Item facet keys and values must be declared by that
   source; undeclared values reject the source result. The workspace renders
   facets only after a concrete `sourceId` is selected, so unrelated sources
   can reuse keys without collision. URL keys use
   `facet.<key>=<value>` and are ignored unless `sourceId` identifies the
   declaring source. An entry missing a selected facet does not match.

   Mail declares:

   - `category`: opportunity, recruiting, work, administrative, personal,
     unclassified;
   - `mail-priority`: high, normal, low;
   - `needs-reply`: true, false.

6. **Only stable filters are linkable; paging stays transient.** CMS workspace
   registration gains an opt-in `urlQuery` capability. The generic container
   initializes only opted-in workspaces from raw URL search strings and keeps
   provider request state separate from canonical URL state. The Inbox server
   normalizes source, urgency, and declared facet values field by field;
   malformed or orphaned values are omitted rather than failing the workspace.
   Filter changes call `history.replace`, never push. Offset and limit are not
   serialized: direct entry always starts at offset zero, and **Load more**
   changes only transient request state. Workspaces without the capability
   ignore URL search and remain unchanged.

7. **The fold preserves new-mail triage and intentionally retires history
   filter chrome.** The Inbox continues to list only `status: "new"`; choosing
   Mark reviewed, Mark handled, or Archive resolves the item. Category,
   mail-priority, and needs-reply facets reproduce every non-status filter for
   those open items. Organization and requested-action fields remain available
   through **Open source entity**. The Mail Items collection remains the
   chronological history and direct correction surface, but this plan does not
   add generic collection filtering. The email-triage Dashboard widget changes
   its high-priority, needs-reply, and unclassified counts to `status: "new"`
   only, labels them accordingly, and targets the matching source/facet Inbox
   URL. This is a deliberate reduction from the old reviewed-item desk, not a
   claim that the collection already has equivalent filters.

8. **Mail recognition is deterministic.** The projection builder, not the
   classifier, derives optional `senderLabel` from the parsed sender display
   name and already-derived domain. It strips controls, rejects address-shaped
   display names and `@`, never uses the local part, and falls back to the
   domain alone. The field is bounded and schema-validated, including the
   unclassified fallback path.

   Thread position is an independent optional slice. Phase 0b adds a durable,
   content-safe `source.threadOrdinal` to mail-item frontmatter and copies the
   existing `threadKey` plus ordinal into indexed metadata, so directory-sync
   round-trips preserve the assignment while reads stay bounded. A restartable
   ordinal coordinator keeps a disposable `building | ready` marker in scoped
   runtime state; a missing marker means `building`. During `building`, new
   ingress indexes `threadKey` but persists no ordinal, and the Inbox source
   exposes no ordinal from partially migrated items. The paged migration orders
   existing items by `receivedAt` then ID; before switching to `ready`, it takes
   an exclusive ingress gate, catches up every still-unordered item, and commits
   the marker. A crash leaves the feature non-visible and the idempotent
   migration reruns. Once ready, ingress uses the same coordinator plus a
   per-`threadKey` lock and reads only the highest indexed ordinal for that
   thread. The UI says **message N in thread**, never `N of N`. Phase 0b may
   follow any later phase without blocking it, but ordinal display cannot
   activate before this migration protocol completes.

9. **Expanded detail is transient, bounded, and hostile-rendered.** The inbox
   contract gains optional `resolveDetail(itemId, actor, signal)`, returning
   the strict shape `{ kind: "plain-text", text, truncated }` with a 100 KiB
   text limit. The operator service first re-lists the source and verifies the
   item is still offered, then supplies an `AbortSignal` with a ten-second
   timeout. Both surface and source require Admin. CMS requests detail by
   same-origin POST; responses use
   `Cache-Control: no-store`. The client keeps the result only in component
   state and clears it on collapse, selection change, or unmount.

   Email resolves the exact source ref, fetches at most 256 KiB, ignores
   attachments, uses parsed plain text when available, and otherwise converts
   HTML to text server-side with scripts, styles, links, and remote resources
   removed. React renders the returned string as text, never HTML. In the
   **View original** flow, source bytes and parsed content never enter an
   entity, runtime state, job payload, log, model call, React Query cache, or
   provider-error response. Reply drafting may pass the same transient result
   to its separately delimited structured-generation boundary. Detail failures
   return one fixed unavailable message.

10. **Opaque IMAP refs get a resolvable private locator.** Phase 6 adds an
    email-interface-owned private SQLite locator store under runtime data,
    never Git or entity storage. Before publishing an inbound event, intake
    idempotently records the existing hashed `sourceRef` to
    `{ mailbox, uidValidity, uid }`; failure prevents event publication and
    cursor advancement. Rows contain no message content, address, subject,
    header, or Message-ID. `sourceReadRetentionDays` defaults to 180 and is
    bounded from 1 to 3,650 days; pruning removes only locator rows. Source read
    looks up the ref, verifies current mailbox and UIDVALIDITY, and fetches only
    that UID. Refs created before the store ships, expired rows, changed
    UIDVALIDITY, and missing messages all return the same fixed unavailable
    result; there is no unbounded mailbox scan or backfill.

    The email interface exposes a typed request/response handler on the
    existing in-memory app message bus in the web runtime, where interface and
    service plugins coexist. The request carries the authenticated actor and
    the interface independently enforces Admin. Worker boots exclude interface
    plugins, so worker registration must not expose source-dependent detail or
    drafting handlers; original content never crosses process IPC or enters a
    job payload. The CMS detail request and reply-draft generation execute in
    the web process. A future worker-side consumer requires a separate IPC
    design and review. This plan owns the locator and source-read contract;
    reply drafting and future web-side consumers import that one contract.

## Out of scope

- **No auto-send anywhere.** Chat prefill and note prefill populate composers
  or drafts; sending and saving stay explicit operator acts.
- **Not a task manager.** Follow-ups create no inbox state, reminders, or
  snooze. An item leaves only through source-owned resolution.
- **No per-item chat binding.** Discuss starts an ordinary conversation; the
  inbox does not track or display its transcript.
- **Reply drafting itself** — delivered by
  [email-reply-drafting.md](./email-reply-drafting.md); this plan renders its
  registered entry point and owns the shared source-read primitive.
- **No durable copies of originals.** The private locator row is transport
  metadata, not message content. Original content remains in the mailbox and
  is never copied into Brain storage.
- **No status-filter replacement for the retired desk.** Historical mail stays
  browsable and editable in Mail Items; generic CMS collection filters require
  a separate plan if operator demand justifies them.

## Phased delivery (thin vertical slices, TDD)

Tests are written first inside each phase.

- **Phase 0a — Recognizable senders.** Projection derives `senderLabel`;
  mail-item schema gains the optional field; rows and detail render it. This
  is the smallest slice that addresses the stated context gap and ships
  independently. _Tests:_ name + domain and domain-only fallbacks; controls,
  `@`, full addresses, and local parts rejected; unclassified path;
  wire/domain decision unchanged; absent field renders nothing; digest stays
  titles-only.
- **Phase 0b — Thread position.** Mail-item frontmatter gains optional
  `source.threadOrdinal`, indexed metadata gains `threadKey` and
  `threadOrdinal`, and the shared coordinator gates migration, ingress
  assignment, and Inbox display. Nothing
  downstream depends on this phase, so it may slip past later phases without
  blocking them. _Tests:_ paged migration is restartable and idempotent; a
  crash never exposes partial ordinals in the Inbox snapshot; arrivals during
  migration are indexed without ordinals and included by the exclusive final
  catch-up; the readiness
  transition and ingress cannot race; a new arrival after legacy items gets the
  next correct ordinal; retries/concurrent arrivals do not duplicate ordinals;
  unmigrated items render no placeholder.
- **Phase 1 — Linkable filter queries.** Add the generic opt-in workspace URL
  capability and separate canonical filter state from transient paging.
  _Tests:_ direct entry filters server-side and starts at offset zero; filter
  changes replace the URL; Load more never writes offset/limit; reload after
  paging starts on page one; malformed/orphan facet params canonicalize to
  defaults; non-opted-in workspaces are unaffected.
- **Phase 2 — Universal follow-ups.** Web-chat accepts prefill at its registered
  route; CMS gains create mode and same-origin history-state prefill; Inbox
  renders chat, capture note, and open entity only when their capabilities
  exist. _Tests:_ prefill lands and is not sent; create seeds an unsaved note;
  reload persists nothing; exact content-safe title/summary/ref payloads;
  entity ID `new` still opens normally; absent web-chat/note capability hides
  its launch; configured non-default mounts; XSS and URL encoding remain
  inert.
- **Phase 3 — Source-scoped facets.** Add facet definitions and item values to
  the contract, generic operator filtering, selected-source rendering, and
  canonical URL keys. Mail declares category, mail-priority, and needs-reply.
  _Tests:_ all bounds and duplicate definitions; undeclared values rejected;
  facets hidden with All sources; combined facet + urgency filtering; missing
  facets do not match; same key may be used independently by two sources;
  malformed/cross-source params are removed.
- **Phase 4 — The fold.** Delete `EmailTriageWorkspace` (renderer,
  registration, enum entries, styles, and tests); advertise the Inbox
  workspace URL as the Admin-only `unified-inbox` interaction; retarget the
  email widget with new-only counts and canonical source/facet URLs. _Tests:_
  renderer enum and routes are gone; counts equal
  the new-only projection; category/priority/reply filters match the old desk
  for new items; reviewed records remain reachable in Mail Items; no dead
  routes, guessed CMS mounts, or widget differences under reversed plugin
  ready order.
- **Phase 5 — Declared follow-ups.** Add bounded same-origin `followUps`, render
  them in the follow-up group, and let email-triage discover the registered
  `email-reply-draft` interaction before offering **Draft reply**. _Tests:_ ID,
  label, count, duplicate, and path bounds; schemes, `//`, and controls reject;
  rendering order never intermixes follow-ups with resolution actions; absent
  interaction renders nothing; non-default registered route is used.
- **Phase 6 — Locator-backed transient original view.** Add the private locator
  store and source-read message contract, then `resolveDetail` and the CMS
  expander. _Tests:_ locator write precedes event/cursor commit; retry upsert;
  restart durability; old/missing/expired/UIDVALIDITY-mismatched refs are the
  same fixed failure; exact-UID and byte bounds; web-runtime request routing;
  worker registration exposes no source-read-dependent handler; Admin
  enforcement at interface, source, and surface; offered-item revalidation;
  timeout/abort; no-store response; component-state cleanup; hostile HTML
  inert; no source content in entities, runtime state, jobs, IPC, logs, model
  calls, client query cache, or provider errors; sources without
  `resolveDetail` render no expander.

## Related plans

- [email-reply-drafting.md](./email-reply-drafting.md) — consumes the source-read
  operation Phase 6 owns and supplies the registered Draft reply destination.
- [atproto-integration.md](./atproto-integration.md) — candidate items gain
  review/invite follow-ups through the Phase 5 field and may expose a bounded
  plain-text profile through `resolveDetail`.
- [bd-priority-engine.md](./bd-priority-engine.md) /
  [lead-management.md](./lead-management.md) — stale-opportunity items link
  into their registered lead/opportunity views through the same target schema.
