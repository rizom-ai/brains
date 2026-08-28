# @brains/unified-inbox

Live, source-owned operator attention without a second inbox store.

## How it works

Service plugins register schema-validated `InboxSource` contributions through
`context.inbox`. Each source lists only items it still considers open and owns every
state transition. `@brains/unified-inbox` aggregates those sources on demand, orders high
urgency before normal urgency and newer items before older items, and isolates source
failures.

The opt-in plugin provides:

- an Admin-only Studio **Inbox** workspace with linkable server-side source, urgency, and
  source-scoped facet filters, bounded transient paging, list/detail triage,
  destination-owned follow-up launches, and confirmation-gated actions; once registered,
  its returned workspace URL is advertised as the Admin-only `unified-inbox` interaction;
- an access-checked open-count badge in the Studio workspace rail;
- a read-only Admin Dashboard summary containing at most five redacted entries;
- the bounded Admin `inbox_list` headless reader, available without browser
  plugins;
- a daily title-only digest that links to the mounted Studio workspace, or to Dashboard when
  Studio is absent.

Actions always re-list the owning source and verify that the requested item and action are
still offered. Confirmed actions are revalidated immediately before dispatch. Optional
source detail is also revalidated, Admin-only, bounded to plain text, requested with abort
and timeout signals, returned with `Cache-Control: no-store`, and kept only in component
state. Browser responses never expose source exception text, and completed actions return
no inbox projection; the client invalidates and reloads the live view. Stable source, urgency, and
selected-source facet filters use the workspace URL, while paging remains in-memory: direct
entry and reload always start at offset zero. Unknown or malformed filter values are removed instead of
failing or producing a private provider error.

Follow-ups launch another surface without resolving the item. Destination owners register
kinds during plugin registration and own labels, applicability, permission gates, final
same-origin target resolution, and optional bounded history state. Sources may name bounded
source-specific declarations, but cannot choose their labels or targets. The workspace
receives only resolved `{ kind, label, href, state? }` targets for its current bounded page;
raw declaration context and resolvers never enter browser or headless output. Studio contributes
**Open source entity** and capability-gated **Capture as note**, prefilled with the safe
Inbox summary and a source link. Web chat contributes **Discuss in chat** for sources with
permission-checked detail, resolving that source transiently on attached turns without
copying it into browser handoff state or conversation storage. Reply drafting is dormant and
contributes no Inbox launch.

The shell registers **Recurring checks** as the first core source. Returned alerts remain
one open item per condition episode until an Admin resolves them. Notification delivery is
independent: unavailable channels leave delivery pending without hiding or duplicating the
Inbox item, while checks with `includeInInbox: false` remain channel-only. The daily Inbox
digest uses that channel-only mode so it never projects a summary of the Inbox back into
itself.

`inbox_list` is directly available to Admin MCP clients in basic mode, including stdio
brains with no webserver, Studio, or Dashboard. It returns source metadata and only the
content-safe `title`, `summary`, `contact`, `receivedAt`, and `urgency` item fields. Item
IDs, source-entity references, resolution actions, source detail, private source locators,
and item facet values are omitted. Source-declared facets can still filter the headless
result through its bounded `facets` input when that source is selected.

## Source contract

Register a source during plugin registration:

```ts
context.inbox.registerSource({
  sourceId: "review-items",
  displayName: "Review items",
  facets: [
    {
      key: "review-state",
      label: "Review state",
      values: [
        { value: "requested", label: "Requested" },
        { value: "blocked", label: "Blocked" },
      ],
    },
  ],
  list: async () => [
    {
      id: "item-1",
      title: "Review requested",
      summary: "A content-safe routing summary.",
      contact: { label: "Sam Rivera · acme.io", personId: "prsn_sam" },
      threadOrdinal: 2,
      receivedAt: new Date().toISOString(),
      urgency: "normal",
      entityRef: { entityType: "review-item", entityId: "item-1" },
      facets: { "review-state": "requested" },
      followUps: [
        { kind: "review-candidate", context: { candidateId: "item-1" } },
      ],
      actions: [{ id: "resolve", label: "Resolve", confirm: true }],
    },
  ],
  resolveDetail: async (itemId, actor, signal) => ({
    kind: "plain",
    text: await readBoundedPrivateSource(itemId, actor, signal),
    truncated: false,
  }),
  act: async (itemId, actionId, actor) => {
    // Re-check source-owned authorization and mutate source state here.
  },
});
```

Facet definitions and item values are bounded and validated together: undeclared keys or
values reject that source result. Facets are filtering metadata, not generic tags or Inbox
state. Their controls appear only after selecting the declaring source, so two sources may
reuse a key without sharing its vocabulary. Stable workspace URL keys use
`facet.<key>=<value>`; paging remains transient.

Titles, summaries, and contact labels must be safe for browser transport. `contact` is a
structured person relationship rather than a presentation byline: `label` is bounded
recognizable text, while optional `personId` is the stable local Auth person key. In the
Studio, a resolved person links through the registered Admin interaction; unresolved contacts
remain plain text. Dashboard and digest projections omit contact labels and identifiers.
Do not include message bodies, secrets, or unnecessary raw addresses. Optional
`threadOrdinal` is a positive, content-safe position supplied only after the owning source
has completed its consistency gate; the Studio renders it as **message N in thread** without
claiming a total. The headless reader, Dashboard, and digest continue to omit it.

## Configuration

The capability is opt-in:

```yaml
add: [unified-inbox]
```

The workspace, Dashboard summary, and tool require no plugin configuration. Universal
follow-ups require no per-source configuration: unavailable destination plugins or denied
capabilities simply remove their launch. Daily delivery
uses the notifications plugin's existing `defaultRecipient`; without one, browser and chat
surfaces continue to work and delivery follows the recurring-check retry path.

The shell-owned `recurring-checks` source is available without email or notification
channels. The first external production source is `mail-items`, registered by
`@brains/email-workflows`. New mail is operated here; reviewed, handled, and archived records
remain in the standard **Mail Items** Studio collection. Source widgets resolve the registered
`unified-inbox` interaction at request time, so custom Studio mounts and plugin ready order do
not change their filter links. The synthetic pilot posture is documented in
[`packages/brain-cli/test-apps/unified-inbox`](../../packages/brain-cli/test-apps/unified-inbox/README.md).
