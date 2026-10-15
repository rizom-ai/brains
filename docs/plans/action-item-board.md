# Plan: Action-item board

## Status

Proposed. Origin: Executive Team Meeting 2026-10-06, action "surface tasks and projects in a shared Kanban board"; first scoped in three PRDs by Niels (board, shared and attributed board, project layer).

Mockups: [action-item-board-mockups.html](../action-item-board-mockups.html) (eight states by phase; desktop and phone; paper and instrument).

## Goal

A team board over the brain's action items. Cards sit in four columns, move between them, take notes, and show who did what. Blocked cards reach the Inbox, Inbox items can become cards, and projects filter the board and roll up its counts. The brain stays the source of truth: the board is a view whose writes change only the fields they own.

## Non-goals

- A standalone app. The board is a Studio workspace.
- A new project entity type. Projects are a Studio grouping (see [Projects](#projects)); `project` already belongs to the portfolio plugin.
- Blank cards. A card comes from a conversation or from an Inbox item.
- Cross-brain or cross-organization boards.
- Permissions beyond the existing visibility model, Studio's Trusted floor and the Admin-only Inbox.

## Baseline

- `action-item` lives in `entities/conversation-memory`. The summary projector extracts it from conversation summaries. Metadata carries `status` (`open | done | dropped`), `assignedTo` and `requestedBy` actors, and the required conversation fields `conversationId`, `channelId`, `interfaceType`, `spaceId`, `timeRange` and `sourceSummaryId`. The body is `# Action item: <first 80 characters>` followed by the extracted text.
- Action-item ids are `<conversationId>:action-item:<index>:<text hash>`.
- When a conversation summary updates, the projector deletes every action item of that conversation and recreates each as `open` (`summary-projector.ts`, `deleteConversationMemory` → `upsertConversationMemory`). Any status, note or membership set after projection is lost.
- Directory-sync import sets `updated` from file mtime and `created` from the stored row or file birthtime, so timestamps cannot mark which items were edited.
- The `team` bundle sets `memoryVisibility: "shared"`, so a team brain already holds one shared set of action items. Cross-interface identities have shipped: one person resolves to one identity across chat and web.
- The dashboard `action-items` widget is a read-only list.
- Plugins register Studio workspaces with `defineStudioWorkspace()`. The vocabulary is closed and host-rendered: `columns`, `list`, `card`, `actions`, `detail` and forms exist; there is no drag primitive. Action handlers receive the acting `ActorRef`.
- Entity-service updates accept `expectedContentHash`. Mutation events carry an actor, but no per-entity change history is stored. `PersistValidator` receives `(entity, { operation })`: it can reject a write, but it cannot rewrite it and does not see the actor.
- The unified Inbox aggregates `InboxSource` registrations (recurring checks, contact, mail triage, FAQ, agent sightings). A source lists only items it still considers open and owns every transition through `act(itemId, actionId, actor)`. Plugins register follow-up kinds through `context.inboxFollowUps.registerKind`. A follow-up launches another surface with prefilled state and never resolves the item; Studio's **Capture as note** is the model.
- Studio groupings (`grouping-definitions`) add exact-value frontmatter membership fields to eligible content types. By the Studio contract `action-item` is eligible; phase 1 proves it with a test.

## Design

### Entity shape

```markdown
---
origin: conversation # conversation | inbox
conversationId: conv-1 # conversation fields, origin: conversation only
channelId: cli-terminal
interfaceType: cli
spaceId: cli:cli-terminal
timeRange: { start: 2026-01-01T00:00:00.000Z, end: 2026-01-01T00:01:00.000Z }
sourceSummaryId: conv-1
sourceMessageCount: 2
projectionVersion: 1
projectedBodyHash: 3f9a… # body hash when projected
status: blocked # open | doing | blocked | done | dropped
assignedTo:
  - { identity: { kind: user, userId: u-niels }, displayName: Niels }
projects: [Hub validation] # Studio grouping membership
history:
  - at: 2026-10-15T08:02:00Z
    actor: { kind: user, userId: u-niels }
    from: open
    to: blocked
---

# Action item: Explore a plugin/prototype to surface tasks in a shared board

Explore a plugin/prototype to surface tasks/projects in a shared Kanban board.

## Notes

- 2026-10-15 · Niels — Waiting on Studio workspace vocabulary review.
```

Metadata becomes a discriminated union on `origin`. Stored records without `origin` parse as `conversation`, so no migration is needed. An `inbox` item carries `sourceRef` (`{ sourceId, entityType, entityId }`, from the Inbox item's source and `entityRef`) in place of the conversation fields. `history` is a Zod-typed frontmatter list of `{ at, actor, from, to }`. Notes stay in the body because they are prose for people.

### Status vocabulary

`status` becomes `open | doing | blocked | done | dropped`; every stored value stays valid.

| Column  | Status    |
| ------- | --------- |
| To do   | `open`    |
| Doing   | `doing`   |
| Blocked | `blocked` |
| Done    | `done`    |

`dropped` has no column; a card's **Drop** action sets it and the card leaves the board. Done shows items finished in the last 14 days and links to the Library for older ones. The dashboard widget counts unfinished items (`open`, `doing`, `blocked`), highlights blocked ones, and launches the board.

### Board-owned items survive re-projection

When creating an item, the projector stores the body's hash as `projectedBodyHash`. An item is board-owned when any of these holds:

- its `status` is not `open`;
- it has a grouping membership;
- its body hash differs from `projectedBodyHash`, which covers notes and Studio text edits.

All three are read from stored content, so the rule survives export and import. `inbox`-origin items are never projected and need no rule.

On a summary update the projector:

1. deletes and recreates only items that are not board-owned;
2. never deletes or overwrites a board-owned item;
3. skips a re-extracted item whose text hash matches a board-owned item of the same conversation, so reordering creates no duplicate.

A re-extraction that rewords an item yields a new `open` card beside the board-owned original; the person drops whichever is redundant.

### One write path

All writes go through one conversation-memory service:

- `move(id, status, actor)` sets `metadata.status` and appends one `history` entry;
- `addNote(id, text, actor)` appends one dated, attributed line under `## Notes`;
- `createFromInbox(input, actor)` creates an `inbox`-origin item.

Each update is conditional on the `contentHash` it read. On a conflict the service re-reads and reapplies once, then reports the conflict. No write replaces body text or touches any other metadata field.

The action-item `PersistValidator` refuses a status change whose newest `history` entry does not record that exact transition, so Studio saves and the generic update tool cannot change status silently. Phase 5 extends `PersistValidator`'s context with the mutation actor; the validator then also requires the entry's actor to match the writer.

### Surface

conversation-memory registers a **Board** workspace under Work at the Trusted floor, composed from `columns`, `list`, `card`, `actions`, `detail` and forms:

- **Card:** title, assignees, age, and a link to its source. That is the summary in the Library for `conversation` items, the source entity for `inbox` items.
- **Card actions:** move to each other column, and Drop.
- **Detail:** full text, requester, notes, history, and an add-note form.

### Inbox

**Blocked cards reach the Inbox.** conversation-memory registers an `action-items` `InboxSource`:

- It lists only `blocked` items, so blockers reach the Inbox and its daily digest without flooding it.
- Each Inbox item has `urgency: normal`, an `entityRef` to the action item, and the actions **Resume** (to `doing`), **Done** and **Drop**.
- `act()` calls `move` with the acting admin, so history and attribution match the board.

**Inbox items become cards.** conversation-memory registers a universal `track-as-action-item` follow-up kind:

- It applies when the item has an `entityRef` and the actor is Trusted.
- It resolves to the Board workspace's create form, prefilled with the Inbox title, summary and source reference.
- Saving calls `createFromInbox`; like every follow-up, it leaves the Inbox item to its source.
- The follow-up does not apply to the `action-items` source's own items.

### Projects

A project is a value of a `projects` grouping on action items, set in the brain's grouping-definitions document. The grouping key is plugin config, defaulting to `projects`. The board filters to one project. A project roll-up shows card counts per column and lists the project's blocked cards. Removing a value from the grouping removes only the label; the action items remain.

## Phases

Each phase ships with its tests and is verified in the running `team` app (`bun start:team` from `packages/brain-cli`).

### Phase 1: Walking skeleton (see, move, keep)

- Status enum; `history` and `projectedBodyHash` fields.
- Board workspace with move and Drop actions; the 14-day Done window.
- `move` with attributed history; the projector follows the board-owned rule.
- Validator refuses status changes without a matching history entry.
- Dashboard widget links to the board.
- Tests:
  - schema accepts all five statuses and stored records without `origin`, `history` or `projectedBodyHash`;
  - a stored `action-item` takes a grouping membership through entity-service and keeps it;
  - the provider groups fixtures into four columns, omits `dropped`, and bounds Done to 14 days;
  - a move changes only `status` and `history`, and both the body and the other fields stay byte-identical;
  - history records the board actor;
  - a stale `contentHash` produces one retry, then a reported conflict;
  - a moved item survives re-projection;
  - an untouched item is still replaced;
  - a reordered board-owned item creates no duplicate;
  - a reworded item yields a new `open` card;
  - an exported-then-imported board-owned item stays board-owned;
  - a Studio save that changes status without history is refused.

### Phase 2: Blockers in the Inbox

- `action-items` Inbox source with Resume, Done and Drop through `move`.
- Tests: the source lists only blocked items; each action records the admin in history; a resolved item leaves the source list; non-admin `act` is refused.

### Phase 3: Notes

- `addNote` and the detail form.
- Tests: a note appends a dated, attributed line under `## Notes`; earlier body text and metadata stay byte-identical; a noted item is board-owned.

### Phase 4: Inbox items become cards

- `origin` union with `sourceRef`; `createFromInbox`; the `track-as-action-item` follow-up and the board's create form.
- Tests:
  - the follow-up applies only to Trusted actors on items with an `entityRef`, and never to `action-items` items;
  - the prefill carries the title, summary and source;
  - saving creates an `inbox`-origin card linked to its source, and the Inbox item stays with its source;
  - the projector never touches `inbox`-origin items.

### Phase 5: Moves from chat, verified actors

- Chat tool over `move` and `addNote`.
- `PersistValidator` context gains the mutation actor; the validator requires the newest history entry's actor to match.
- Tests:
  - a move from the board and one from the chat tool by the same person record the same identity;
  - a history entry naming another actor is refused;
  - non-status updates pass.

### Phase 6: Projects

- Configurable grouping key; board project filter; per-project roll-up with blocked list.
- Tests:
  - the filter shows only members;
  - counts per column match fixtures;
  - blocked cards appear in the roll-up;
  - removing the grouping value leaves the items intact.

### Phase 7: Drag-and-drop

- Add a `board` block with a typed move action to the shared declarative vocabulary, rendered by the Studio host.
- The Board workspace switches to it; per-card move actions remain for keyboard and phone.
- Tests: renderer contract tests for the block, keyboard-accessible moves, and a mounted Studio test where dragging persists through `move`.
