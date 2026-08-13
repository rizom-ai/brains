# Plan: Inbox follow-ups and the email-triage fold

## Status

**Active.** Builds directly on the shipped unified inbox (contract, CMS
workspace, digest). Phases 0a, 0b, 1, 7, and 8 are implemented; Phases 2–6
remain planned. UX mockup:
[inbox-follow-ups-mockup.html](./inbox-follow-ups-mockup.html).

`unified-inbox` is being promoted from an explicit opt-in to a `core` bundle
member by [brain-model-unification.md](./brain-model-unification.md). Phases 7
and 8 below are the conditions of that promotion and are independent of the
follow-up surfaces in Phases 0b–6.

## Goal

The inbox stops being a chore list and becomes a launch pad. Today every
affordance on an item is a resolution transition (mark reviewed, mark handled,
archive) — the only thing an operator can do with attention is dismiss it.
Different items must lead to different next activities: discuss a mail with
the brain, capture an idea as a note, draft a reply, review a candidate. At
the same time, recognized mail senders remain connected to their People
identity instead of becoming a decorative byline, and the CMS stops presenting
two open-attention surfaces: with one source registered, the Inbox workspace
and the default-new view of the Email Triage workspace show the same arrivals
with different chrome.

## What exists today (fact-check)

- The inbox contract (`shell/plugins/src/inbox-registry.ts`) gives every item
  `id`, content-safe `title`/`summary`, `receivedAt`, `urgency`, optional
  `entityRef`, and source-owned `actions`. Actions mutate source state through
  `act` and resolve items out of the projection. The Admin-only `inbox_list`
  tool is the headless reader: it returns source metadata plus a strict allowlist
  of `title`/`summary`/`urgency`/`receivedAt`/`contact`, while omitting item IDs,
  entity references, actions, and source detail.
- The Inbox workspace already renders **Open source entity** from `entityRef` —
  the only non-resolution affordance an item has. It is hard-coded in the
  renderer; there is no contract through which another plugin can contribute a
  launch.
- App-scoped, owner-aware contribution registries are the established pattern
  for this shape. `ChannelRegistry` and `InboxRegistry` close registration with
  an explicit finalize step; the CMS workspace and interaction registries are
  live registries without that step. Follow-up kinds need the finalized variant
  because one immutable catalog must arbitrate duplicate ownership, permissions,
  and ordering before any item is resolved.
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
- Mail items carry no operator-recognizable contact: `source.senderKey` is a
  hash and `organization` is optional, so the title must carry all context.
  Inbound intake already asks Auth to resolve the parsed sender address and the
  projection persists a resolved `source.personId`, but the recognizable label
  and person relationship do not reach the Inbox contract or UI. Mixed-case
  sender addresses resolve correctly today, but only incidentally: the email
  address parser lowercases before the lookup, while `createExternalActorId`
  hashes its input verbatim and Auth's stored hash requires the lowercased
  identity key. Nothing pins that agreement — normalization belongs at the
  hash boundary, with a regression test. A hashed `threadKey` and its
  migration-gated ordinal now live in indexed metadata for bounded position
  lookup.
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
   Target normalization requires a leading single `/`, rejects `//`, URL
   schemes, backslashes, control characters, and paths over 2,048 characters.
   It parses against a sentinel origin and requires the normalized result to
   retain that origin. Registration normalizes and freezes static metadata and
   any static base path, but an item-dependent resolver cannot pre-validate a
   target that does not exist yet: every resolved final path is independently
   normalized before it enters a response. A static base-path check never
   exempts the final target check. Missing or invalid targets hide the
   affordance; a source never supplies a path.

3. **Follow-ups are registered kinds: destinations own resolution, sources
   declare intent.** Sources never choose labels or permissions and never build,
   encode, or validate a URL. A new app-scoped follow-up kind registry in
   `@brains/plugins` exposes owner-scoped register/unregister, finalize, list,
   and lookup operations. Destinations register during `onRegister`, and
   `shellBootloader` finalizes the catalog beside the inbox source registry, so
   a kind registered later — during `onReady` or from a lazily constructed
   surface — is rejected rather than silently dropped.
   Registration closes at finalization; reads before finalization fail. Plugin
   resource cleanup unregisters all kinds owned by a plugin on failed
   registration and shutdown, and a post-finalization removal rebuilds the
   active catalog fail-closed in the same manner as the Inbox registry.

   Each kind registration carries:

   - `kind` using the Inbox ID grammar, a 1–100 character operator-facing
     `label`, and a deterministic integer `priority` from 0–1,000, all
     normalized and frozen when the catalog finalizes;
   - `mode: "universal" | "declared"`, so applicability alone cannot
     accidentally turn a source-specific launch into a universal one;
   - the `UserPermissionLevel` required to display the launch;
   - an applicability predicate over `{ sourceId, item, actor, context }`;
   - for declared kinds, a destination-owned context schema;
   - a resolver over the same input that returns `{ href, state? }` or
     `undefined`.

   The presentation permission is only a visibility gate. The destination
   independently authenticates and authorizes every opened route; CMS still
   checks entity access and create permission, web-chat still checks chat
   access, and reply drafting still revalidates the mail item and actor. A
   resolver receives the source ID because item IDs are only source-local — it
   is scoping context, never an exclusion lever. A predicate narrows on item
   shape (`entityRef.entityType`, declared context, actor permission); a
   destination that tests `sourceId` against a list of known sources has
   reintroduced exactly the coupling this contract removes.

   Resolver output is evaluated server-side after the source item and actor are
   validated. Decision 2's same-origin rules are applied to every final `href`.
   Optional history `state` is produced only by the destination-owned resolver,
   must be JSON-safe and no more than 8 KiB serialized, and is parsed again by
   the destination on arrival. Raw declaration context, the resolver, and
   non-presentation registry metadata never enter the CMS response, React Query
   cache, URL, or headless output; the browser receives only the resolved
   `{ kind, label, href, state? }` presentation target.

   The plugin that owns the destination registers the kind: web-chat registers
   `discuss-in-chat`; CMS registers `capture-as-note` and `open-entity`;
   [email-reply-drafting.md](./email-reply-drafting.md) registers `draft-reply`;
   and the atproto and lead plans register their own. Nothing about a target
   route lives in unified-inbox.

   `InboxItem` gains at most eight declared
   `followUps?: { kind, context }[]`, with duplicate kinds rejected. `context`
   is a flat record of at most eight string entries: keys match
   `^[a-z][A-Za-z0-9]{0,39}$`, values are bounded to 300 characters, controls
   and empty values are rejected, and nested values are forbidden. Generic
   parsing preserves opaque
   values byte-for-byte; the destination-owned kind schema then validates their
   meaning before the predicate or resolver runs. For `draft-reply`, that schema
   accepts only the expected opaque mail-item ID. A declared kind is considered
   only when the item names it. A universal kind is considered for every item
   without requiring a matching source declaration or any context. Both modes
   must pass registration lookup, actor permission, context parsing where
   applicable, and the applicability predicate. Unavailable or invalid kinds
   render nothing. A context parser, predicate, or resolver failure is isolated
   to that launch and returns no plugin exception detail.

   The three built-in registrations use `mode: "universal"` and apply only when
   `item.entityRef` exists:

   - **Open source entity** — behavior remains unchanged and CMS rechecks access
     when the entity is opened. Today's hard-coded renderer affordance is
     deleted in the same phase that registers this kind: the launch must exist
     once, through the registry, with no `entityRef`-derived button left in the
     workspace.
   - **Discuss in chat** — opens the registered web-chat path with a bounded
     composer prefill: `About inbox item: <title> (<entityType>/<entityId>)`.
     Only the already content-safe title and reference enter the handoff; no
     summary or source body does. The composer is populated but never sent.
     Web-chat runs at the operator's permission and may resolve the restricted
     entity only after the operator submits the message.
   - **Capture as note** — CMS explicitly targets the registered `note` entity;
     it does not choose an arbitrary capture type. Applicability fails when
     `note` is absent or the actor cannot create it. CMS gains the collision-free
     `/entities/note?mode=create` target (rather than reserving the valid entity
     ID `new`). The item title and the canonical
     `entity://<encoded-type>/<encoded-id>` backlink travel in bounded,
     same-origin router history state, not URL query parameters, server logs, or
     storage. The derived summary is deliberately **not** seeded into the note
     body: a note is operator-authored thought, and copying classifier-derived
     text into a durable entity would create exactly the second stale copy this
     architecture refuses everywhere else. The destination validates the state
     envelope before using it. A reload opens an empty draft; nothing persists
     until Save.

4. **Rendering order is fixed.** Within the follow-up group, declared kinds
   render before universal ones; each group sorts by destination-owned
   `priority` and then `kind`, so source array order and plugin registration
   order cannot change the UI. Follow-ups never intermix with resolution
   actions. Specific, high-intent launches stay first as the group grows; no
   launch is buried behind an overflow menu, which would defeat the surface's
   purpose.

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

8. **Mail recognition preserves contact identity.** A sender is not flattened
   into a generic presentation byline. `InboxItem` instead gains the bounded,
   strict optional contact shape `contact?: { label, personId? }`. `personId`
   is the stable local Auth person key used by the People surface; Auth's
   optional cross-system `canonicalId` remains attribution metadata and is not
   substituted for that local lookup key.

   Intake normalizes the parsed address with `trim().toLowerCase()` before
   building the hashed `email:<address>` external actor ID. Auth resolves that
   hash only through a non-revoked, verified email identity belonging to an
   active person. A resolved principal contributes `personId` and Auth's
   resolved display name to the transient inbound attribution. Unknown,
   asserted-only, revoked, or inactive identities remain unresolved: inbound
   mail never creates a person and no display-name, domain, classifier, or AI
   heuristic may infer one.

   The projection builder, not the classifier, persists optional
   `senderLabel`. For a resolved sender it prefers the Auth display name; for
   an unresolved sender it uses the parsed display name. In both cases it
   strips controls, rejects address-shaped names and `@`, never uses the local
   part, appends the already-derived domain when a safe name exists, and falls
   back to the domain alone. The field is bounded and schema-validated in both
   classified and unclassified paths. The mail Inbox source maps
   `senderLabel` plus `source.personId` to `contact`; it does not expose the
   sender address or sender hash.

   A resolved contact is also connectable. At request time, the CMS resolves
   the registered Admin interaction, adds only the local person key with the URL
   API as `person=<personId>`, and revalidates the final same-origin target. The
   Admin surface owns that query contract and opens its People view with the
   exact matching person selected; an unknown or malformed person value is
   ignored. Missing Admin registration or an unresolved sender leaves the
   label as plain text; the Inbox never guesses `/admin`, places an address in
   the URL, or links a domain-only fallback.

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
   thread. The UI says **message N in thread**, never `N of N`. No downstream
   phase depends on this slice, and ordinal display cannot activate before this
   migration protocol completes.

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
    the interface independently enforces Admin. The invariant is stated
    without assuming a particular process model: the source-read handler is
    registered only where interface plugins run, and any boot that excludes
    interface plugins — present or future worker processes — must not gain a
    source-dependent detail or drafting handler; original content never
    crosses process IPC or enters a job payload. The CMS detail request and
    reply-draft generation execute in the web process. A future worker-side
    consumer requires a separate IPC design and review. This plan owns the
    locator and source-read contract; reply drafting and future web-side
    consumers import that one contract.

11. **The projection is core; every surface here is a channel.** Under the
    bundle taxonomy in [brain-model-unification.md](./brain-model-unification.md),
    `unified-inbox` belongs to `core` — it aggregates whatever `InboxSource`s
    are registered over a registry that already lives at shell level, needs no
    inbound listener, and depends on no third-party account. The renderings
    belong to the bundles that own their channels: the CMS workspace, create
    mode, and Dashboard widget are `web`; the digest is `chat`, because
    `notifications` lives there. Everything in Phases 0b–6 is therefore
    channel work sitting above a core capability. The plugin does not move to
    `web` to be near its UI, and the surfaces do not move into `core` to be
    near the projection.

    Two consequences follow, and both are conditions of the promotion rather
    than results of it. Phase 7 supplies the browser-independent reader because
    this is a live projection and the framework `system_*` tools only see the
    entity database. Phase 8 supplies the first source present in a `[core]`
    brain by projecting recurring-check alerts independently of notification
    delivery.

## Out of scope

- **No auto-send anywhere.** Chat prefill and note prefill populate composers
  or drafts; sending and saving stay explicit operator acts.
- **Not a task manager.** Follow-ups create no inbox state, reminders, or
  snooze. An item leaves only through source-owned resolution.
- **No per-item chat binding.** Discuss starts an ordinary conversation; the
  inbox does not track or display its transcript.
- **No operator configuration of follow-ups.** Availability is decided by
  registration, permission, and applicability — not by settings. A source that
  needs a universal kind hidden is a signal to narrow that kind's applicability
  predicate on item shape, not to add a toggle and not to name the source
  inside the destination.
- **No automatic contact creation or fuzzy reconciliation.** Unknown senders
  stay unresolved until a verified Auth identity exists; names, domains,
  classifications, and model output never create or merge People records.
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

- **Phase 0a — Recognizable, connected senders (implemented).** Normalize hashed email
  identity lookup, carry resolved Auth attribution into the projection, derive
  `senderLabel`, and add the structured Inbox `contact` contract. Rows and
  detail render the contact; a resolved `personId` opens the exact person at
  the registered Admin interaction, while unresolved contacts remain plain
  text. This slice ships independently and does not alter classification.
  _Tests:_ mixed-case addresses resolve the same verified identity; unbound,
  asserted-only, revoked, and inactive identities do not resolve or create a
  person; the resolver request contains no raw address; Auth's resolved display
  name wins for a resolved sender; parsed name-and-domain and domain-only
  fallbacks; controls, `@`, full addresses, and local parts rejected;
  classified and unclassified paths; contact schema bounds; wire/domain
  classification decision unchanged; exact-person deep link at a non-default
  Admin mount; malformed or unknown person queries are ignored; missing Admin
  and unresolved contacts render no link or placeholder; digest and Dashboard
  remain free of contact labels and identifiers.
- **Phase 0b — Thread position (implemented).** Mail-item frontmatter gains optional
  `source.threadOrdinal`, indexed metadata gains `threadKey` and
  `threadOrdinal`, and the shared coordinator gates migration, ingress
  assignment, and Inbox display. Nothing downstream depends on this phase.
  _Tests:_ paged migration is restartable and idempotent; a
  crash never exposes partial ordinals in the Inbox snapshot; arrivals during
  migration are indexed without ordinals and included by the exclusive final
  catch-up; the readiness
  transition and ingress cannot race; a new arrival after legacy items gets the
  next correct ordinal; retries/concurrent arrivals do not duplicate ordinals;
  unmigrated items render no placeholder.
- **Phase 1 — Linkable filter queries (implemented).** Add the generic opt-in
  workspace URL capability and separate canonical filter state from transient
  paging.
  _Tests:_ direct entry filters server-side and starts at offset zero; filter
  changes replace the URL; Load more never writes offset/limit; reload after
  paging starts on page one; malformed/orphan facet params canonicalize to
  defaults; non-opted-in workspaces are unaffected.
- **Phase 2 — Follow-up kind registry and the three built-in kinds.** Add the
  finalized app-scoped kind registry; web-chat accepts prefill at its registered
  route and registers universal `discuss-in-chat`; CMS gains create mode with
  same-origin history-state prefill and registers universal `capture-as-note`
  and `open-entity`, replacing the renderer's hard-coded Open source entity
  button; the Inbox resolves and renders the registry intersection
  server-side. _Tests:_ registry lifecycle (duplicate kind rejected, use before
  finalize and registration after finalize rejected, registration during
  `onReady` rejected, owner unregister, failed-registration rollback, shutdown
  cleanup); static metadata freezing;
  final resolver-output normalization on every call (schemes, `//`,
  backslashes, controls, length, and sentinel-origin retention); predicate and
  resolver failure isolation without exception disclosure; explicit mode
  prevents a declared kind from auto-applying; deterministic priority/kind
  ordering; label, permission, and state come from the registration/resolver,
  not a source; predicate hides kinds for items without `entityRef`; prefill
  lands and is not sent; create seeds an unsaved note; reload persists nothing;
  the note draft carries title and backlink and **no** derived summary; absent
  or non-createable `note` hides capture; entity ID `new` still opens normally;
  absent web-chat hides only chat; insufficient permission hides the launch;
  exactly one Open source entity launch renders and no `entityRef`-derived
  button survives in the renderer; a catalog offering no applicable kind
  renders no follow-up group rather than an empty labelled one; every
  destination reauthorizes direct entry; configured non-default mounts;
  oversized or malformed state, XSS, and URL encoding remain inert.
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
- **Phase 5 — Source-declared kinds.** Add the bounded, flat
  `followUps?: { kind, context }[]` declarations to `InboxItem`, and have
  email-triage declare `draft-reply` on `needsReply` items with the opaque
  mail-item ID as context;
  [email-reply-drafting.md](./email-reply-drafting.md) registers that declared
  kind, its context schema, and its resolver. No URL construction enters this
  phase. _Tests:_ declaration count, duplicate-kind, key/value/control, flatness,
  and context bounds; generic parsing preserves opaque values; destination
  schema rejection hides the launch before predicate/resolver execution;
  unregistered or universal kinds named by a source render nothing; the
  resolver receives validated `{ sourceId, item, actor, context }`; raw context
  never reaches browser or headless output; declared kinds render before
  universal ones with deterministic destination-owned ordering and never
  intermix with resolution actions; a source cannot override a registered
  label, permission, state, or target; absent reply-drafting registration
  renders nothing; direct entry is reauthorized; non-default registered route
  is used.
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

- **Phase 7 — Headless reader (implemented).** Harden `inbox_list` so the live
  projection is reachable over MCP stdio with no webserver, CMS, or Dashboard.
  The tool is Admin-only and returns source metadata plus a strict allowlist of
  the same content-safe `title`/`summary`/`urgency`/`receivedAt`/`contact`
  fields the workspace renders. Item IDs, entity references, actions, and
  source detail are omitted. Source and urgency use the workspace's shared
  filter path; declared facets join that vocabulary with Phase 3. `resolveDetail`
  remains a Phase 6 surface concern requiring its own Admin check. _Tests:_ MCP
  protocol access with no browser plugins; an empty registry returns an empty
  result rather than an error; filters agree field for field with the workspace
  for the same inputs; non-Admin actors are rejected before source reads; no
  source body, sender address, sender hash, locator, or action appears in the
  response.
- **Phase 8 — Recurring checks as the first core source (implemented).** Re-point
  `shell/recurring-checks` at the inbox so `RecurringAlert` and failing
  `RecurringCheckResult`s register as `InboxSource` items instead of being
  delivered only through notifications. This makes scheduled-work failures
  visible to a brain with no chat channel and demotes notifications from being
  the surface for things needing attention to being one delivery channel for
  them. The source declares its own resolution actions; alerts leave the
  projection the same way mail does. _Tests:_ a failing check appears as an
  inbox item with no notification channel present; adding one delivers the
  same item without duplicating it in the projection; resolving from the
  inbox stops redelivery; a passing check contributes nothing; recurring
  cadence and existing notification consumers are unchanged.

  directory-sync import issues are the natural second source once the in-flight
  [directory-sync-import-load.md](./directory-sync-import-load.md) work lands,
  since `importFile` already records an operation-status issue for skipped
  oversized files that has no operator surface today. agent-discovery's
  pending-approval queue and inbound A2A tasks from unapproved peers are later
  candidates.

## Related plans

- [brain-model-unification.md](./brain-model-unification.md) — promotes
  `unified-inbox` into `core` and owns the bundle taxonomy that places these
  surfaces in `web` and the digest in `chat`. Phases 7 and 8 here are the
  conditions of that promotion.

- [email-reply-drafting.md](./email-reply-drafting.md) — consumes the source-read
  operation Phase 6 owns, and registers the `draft-reply` follow-up kind with
  its own resolver; email-triage only declares the kind on `needsReply` items.
- [atproto-integration.md](./atproto-integration.md) — registers its own
  review/invite kinds and declares them on candidate items; may expose a
  bounded plain-text profile through `resolveDetail`.
- [bd-priority-engine.md](./bd-priority-engine.md) /
  [lead-management.md](./lead-management.md) — register lead/opportunity kinds
  owned by those surfaces; stale-opportunity items declare them by kind.
