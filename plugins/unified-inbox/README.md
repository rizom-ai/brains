# @brains/unified-inbox

Live, source-owned operator attention without a second inbox store.

## How it works

Service plugins register schema-validated `InboxSource` contributions through
`context.inbox`. Each source lists only items it still considers open and owns every
state transition. `@brains/unified-inbox` aggregates those sources on demand, orders high
urgency before normal urgency and newer items before older items, and isolates source
failures.

The opt-in plugin provides:

- an Admin-only CMS **Inbox** workspace with server-side source/urgency filters, bounded
  paging, list/detail triage, source-entity navigation, and confirmation-gated actions;
- an access-checked open-count badge in the CMS workspace rail;
- a read-only Admin Dashboard summary containing at most five redacted entries;
- the bounded Admin `inbox_list` headless reader, available without browser
  plugins;
- a daily title-only digest that links to the mounted CMS workspace, or to Dashboard when
  CMS is absent.

Actions always re-list the owning source and verify that the requested item and action are
still offered. Confirmed actions are revalidated immediately before dispatch. Browser
responses never expose source exception text, and completed actions return no inbox
projection; the client invalidates and reloads the live view.

The shell registers **Recurring checks** as the first core source. Returned alerts remain
one open item per condition episode until an Admin resolves them. Notification delivery is
independent: unavailable channels leave delivery pending without hiding or duplicating the
Inbox item, while checks with `includeInInbox: false` remain channel-only. The daily Inbox
digest uses that channel-only mode so it never projects a summary of the Inbox back into
itself.

`inbox_list` is directly available to Admin MCP clients in basic mode, including stdio
brains with no webserver, CMS, or Dashboard. It returns source metadata and only the
content-safe `title`, `summary`, `contact`, `receivedAt`, and `urgency` item fields. Item
IDs, source-entity references, resolution actions, source detail, and private source
locators are omitted.

## Source contract

Register a source during plugin registration:

```ts
context.inbox.registerSource({
  sourceId: "review-items",
  displayName: "Review items",
  list: async () => [
    {
      id: "item-1",
      title: "Review requested",
      summary: "A content-safe routing summary.",
      contact: { label: "Sam Rivera · acme.io", personId: "prsn_sam" },
      receivedAt: new Date().toISOString(),
      urgency: "normal",
      entityRef: { entityType: "review-item", entityId: "item-1" },
      actions: [{ id: "resolve", label: "Resolve", confirm: true }],
    },
  ],
  act: async (itemId, actionId, actor) => {
    // Re-check source-owned authorization and mutate source state here.
  },
});
```

Titles, summaries, and contact labels must be safe for browser transport. `contact` is a
structured person relationship rather than a presentation byline: `label` is bounded
recognizable text, while optional `personId` is the stable local Auth person key. In the
CMS, a resolved person links through the registered Admin interaction; unresolved contacts
remain plain text. Dashboard and digest projections omit contact labels and identifiers.
Do not include message bodies, secrets, or unnecessary raw addresses.

## Configuration

The capability is opt-in:

```yaml
add: [unified-inbox]
```

The workspace, Dashboard summary, and tool require no plugin configuration. Daily delivery
uses the notifications plugin's existing `defaultRecipient`; without one, browser and chat
surfaces continue to work and delivery follows the recurring-check retry path.

The shell-owned `recurring-checks` source is available without email or notification
channels. The first external production source is `mail-items`, registered by
`@brains/email-triage`. The synthetic pilot posture is documented in
[`packages/brain-cli/test-apps/unified-inbox`](../../packages/brain-cli/test-apps/unified-inbox/README.md).
