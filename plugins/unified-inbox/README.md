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
- the bounded Admin `inbox_list` conversational tool;
- a daily title-only digest that links to the mounted CMS workspace, or to Dashboard when
  CMS is absent.

Actions always re-list the owning source and verify that the requested item and action are
still offered. Confirmed actions are revalidated immediately before dispatch. Browser
responses never expose source exception text, and completed actions return no inbox
projection; the client invalidates and reloads the live view.

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

Titles and summaries must be safe for browser and notification transport. Do not include
message bodies, secrets, or unnecessary raw addresses.

## Configuration

The capability is opt-in:

```yaml
add: [unified-inbox]
```

The workspace, Dashboard summary, and tool require no plugin configuration. Daily delivery
uses the notifications plugin's existing `defaultRecipient`; without one, browser and chat
surfaces continue to work and delivery follows the recurring-check retry path.

The first production source is `mail-items`, registered by `@brains/email-triage`. The
synthetic pilot posture is documented in
[`packages/brain-cli/test-apps/unified-inbox`](../../packages/brain-cli/test-apps/unified-inbox/README.md).
