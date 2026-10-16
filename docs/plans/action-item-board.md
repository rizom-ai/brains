# Plan: Action-item board

## Status

Phase 1 (walking skeleton) shipped: the Board workspace, attributed moves, board-owned items surviving re-projection, the status validator and the Overview widget. Phases 2–7 remain. Origin: Executive Team Meeting 2026-10-06, action "surface tasks and projects in a shared Kanban board"; first scoped in three PRDs by Niels (board, shared and attributed board, project layer).

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

- `action-item` lives in `entities/conversation-memory`. The summary projector extracts it from conversation summaries. Metadata carries `status` (`open | doing | blocked | done | dropped`), `assignedTo` and `requestedBy` actors, the conversation fields (`conversationId`, `channelId`, `interfaceType`, `spaceId`, `timeRange`, `sourceSummaryId`), `projectedBodyHash` and a Zod-typed `history` of `{ at, actor, from, to }`. The body is `# Action item: <first 80 characters>` followed by the extracted text. Ids are `<conversationId>:action-item:<index>:<text hash>`.
- An item is board-owned once its status leaves `open`, it gains a grouping membership, or its body hash differs from `projectedBodyHash`; all three are read from stored content, so ownership survives export and import. Replacing a conversation's memory deletes only untouched items, and a re-extracted item whose text hash matches a board-owned one is skipped (`summary-projector.ts`, `action-item-board.ts`).
- `moveActionItem` is the one status write path: it sets `status`, appends a history entry naming the mover, and writes conditionally on the `contentHash` it read. An unrelated concurrent edit is reapplied once; a card already moved by someone else is reported, never overridden. A `PersistValidator` refuses any status change without its matching history entry, so Studio saves, the generic update tool and file imports cannot move a card silently.
- conversation-memory registers a Trusted **Board** workspace under Work (`conversation-memory:board`) from `onReady`. A four-column `matrix` block holds To do, Doing, Blocked and Done; Done shows items finished in the last 14 days, falling back to capture time for items finished before moves were recorded. Each card shows assignees, age, channel and how long it has been blocked, links to the action item and its source summary, and offers its column's moves plus a confirmed Drop under a **Move** action sheet. A move's outcome, including a conflict, returns as the action result, because the host redacts thrown errors.
- The `action-items` dashboard widget is Trusted: Studio Overview lists blocked items under Needs you, its attention count is the number of blocked items, and it links to the board through the `board` launch target.
- Studio workspace actions receive only the caller's user id (`OperatorCaller.actor`), so history records `{ kind: "user", userId }` and the board cannot yet show who moved a card by name.
- The shared `detail` block accepts only a `list` or `table` master; an in-board detail panel next to the `matrix` needs that vocabulary widened.
- The `team` bundle sets `memoryVisibility: "shared"`, so a team brain holds one shared set of action items. Cross-interface identities have shipped.
- The unified Inbox aggregates `InboxSource` registrations (recurring checks, contact, mail triage, FAQ, agent sightings). A source lists only items it still considers open and owns every transition through `act(itemId, actionId, actor)`. Plugins register follow-up kinds through `context.inboxFollowUps.registerKind`. A follow-up launches another surface with prefilled state and never resolves the item; Studio's **Capture as note** is the model.
- `action-item` is an eligible grouping contributor (proved against a real entity database), so a `projects` grouping can hold memberships on it.

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

### One write path

All writes go through one conversation-memory service:

- `move(id, from, to, actor)` (shipped);
- `addNote(id, text, actor)` appends one dated, attributed line under `## Notes`;
- `createFromInbox(input, actor)` creates an `inbox`-origin item.

Every write is conditional on the `contentHash` it read, reapplies once after an unrelated concurrent edit, and never replaces body text or touches another metadata field. Phase 5 extends `PersistValidator`'s context with the mutation actor; the validator then also requires the entry's actor to match the writer.

### Card detail

Phase 3 widens the shared `detail` block to accept a `matrix` master, so selecting a card opens a panel beside the board: full text, requester, source, notes, history with names, and an add-note form. History names come from resolving each entry's user id to its display name when the board loads; entries keep the id.

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

### Phase 2: Blockers in the Inbox

- `action-items` Inbox source with Resume, Done and Drop through `move`.
- Tests: the source lists only blocked items; each action records the admin in history; a resolved item leaves the source list; non-admin `act` is refused.

### Phase 3: Card detail and notes

- The shared `detail` block accepts a `matrix` master; the Board opens a card's detail beside the columns.
- History and blocked badges show names, resolved from the stored user ids.
- `addNote` and the detail form.
- Tests:
  - the detail block validates and renders with a `matrix` master in Studio;
  - history and the blocked badge show the mover's display name;
  - a note appends a dated, attributed line under `## Notes`; earlier body text and metadata stay byte-identical;
  - a noted item is board-owned.

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
