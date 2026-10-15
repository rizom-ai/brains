# Plan: Action-item board

## Status

Proposed. Origin: Executive Team Meeting 2026-10-06, action "surface tasks and projects in a shared Kanban board"; first scoped in three PRDs by Niels (board, shared and attributed board, project layer).

## Goal

A team board over the brain's action items. Cards sit in four columns, move between them, take notes, and show who did what; projects filter the board and roll up its counts. The brain stays the source of truth: the board is a view whose writes change only the fields they own.

## Non-goals

- A standalone app. The board is a Studio workspace.
- A new project entity type. Projects are a Studio grouping (see [Projects](#projects)); `project` already belongs to the portfolio plugin.
- Creating action items on the board. They come from conversations.
- Cross-brain or cross-organization boards.
- Permissions beyond the existing visibility model and Studio's Trusted floor.

## Baseline

- `action-item` lives in `entities/conversation-memory`. The summary projector extracts it from conversation summaries. Metadata carries `status` (`open | done | dropped`), `assignedTo` and `requestedBy` actors, `conversationId` and `sourceSummaryId`. Storage is YAML frontmatter plus a markdown body.
- Action-item ids are `<conversationId>:action-item:<index>:<text hash>`.
- When a conversation summary updates, the projector deletes every action item of that conversation and recreates each as `open` (`summary-projector.ts`, `deleteConversationMemory` → `upsertConversationMemory`). Any status, note or membership set after projection is lost.
- The `team` bundle sets `memoryVisibility: "shared"`, so a team brain already holds one shared set of action items. Cross-interface identities have shipped: one person resolves to one identity across chat and web.
- The dashboard `action-items` widget is a read-only list.
- Plugins register Studio workspaces with `defineStudioWorkspace()`. The vocabulary is closed and host-rendered: `columns`, `list`, `card`, `actions`, `detail` and forms exist; there is no drag primitive. Action handlers receive the acting `ActorRef`.
- Entity-service updates accept `expectedContentHash`. Mutation events carry an actor, but no per-entity change history is stored. `PersistValidator` can reject a create or update; it cannot rewrite it.
- Studio groupings (`grouping-definitions`) add exact-value frontmatter membership fields to eligible content types; `action-item` is eligible by default. Studio lists each grouping's values and members.

## Design

### Status vocabulary

`status` becomes `open | doing | blocked | done | dropped`. No migration: every stored value stays valid.

| Column  | Status    |
| ------- | --------- |
| To do   | `open`    |
| Doing   | `doing`   |
| Blocked | `blocked` |
| Done    | `done`    |

`dropped` has no column; a card's **Drop** action sets it and the card leaves the board. The dashboard widget counts unfinished items (`open`, `doing`, `blocked`), highlights blocked ones, and launches the board.

### Board-owned items survive re-projection

An action item becomes board-owned once anything other than the projector writes it: a move, a note, a grouping membership or a Studio save. The projector writes `created` and `updated` together. Every other write path changes only `updated`, so `updated ≠ created` marks a board-owned item.

On a summary update the projector:

1. deletes and recreates only items that are not board-owned;
2. never deletes or overwrites a board-owned item;
3. skips a re-extracted item whose text hash matches a board-owned item of the same conversation, so reordering creates no duplicate.

A re-extraction that rewords an item yields a new `open` card beside the board-owned original; the person drops whichever is redundant.

### One write path

All board writes go through one conversation-memory service:

- `move(id, status, actor)` sets `metadata.status` and appends one history entry;
- `addNote(id, text, actor)` appends one entry under `## Notes`.

Each write is conditional on the `contentHash` it read. On a conflict the service re-reads and reapplies once, then reports the conflict. No write replaces existing body text or touches any other metadata field.

History entries live in the body under `## History`, one line each: timestamp, actor display name, `from → to`. The actor identity key is stored with the entry. Notes carry the same actor and timestamp.

The action-item `PersistValidator` refuses a status change whose newest history entry does not record that exact transition. Studio saves and the generic update tool therefore cannot change status silently. The service is exposed to chat as a plugin tool, so a move made in chat and one made on the board attribute to the same identity.

### Surface

conversation-memory registers a **Board** workspace under Work at the Trusted floor, composed from `columns`, `list`, `card`, `actions` and `detail`:

- **Card:** title, assignees, age, and a link to its source summary in the Library.
- **Card actions:** move to each other column, and Drop.
- **Detail:** full text, requester, notes, history, and an add-note form.

### Projects

A project is a value of a `projects` grouping on action items, set in the brain's grouping-definitions document. The grouping key is plugin config, defaulting to `projects`. The board filters to one project. A project roll-up shows card counts per column and lists the project's blocked cards. Removing a value from the grouping removes only the label; the action items remain.

## Phases

Each phase ships with its tests and is verified in the running `team` app (`bun start:team` from `packages/brain-cli`).

### Phase 1: Read-only board

- Extend the status enum; columns map as above.
- Register the Board workspace with read-only cards, detail and source links.
- Point the dashboard widget at unfinished items and the board.
- Tests: schema accepts all five values and existing records; workspace provider groups fixtures into the four columns and omits `dropped`; widget counts.

### Phase 2: Moves

- Projector re-projection follows the board-owned rule.
- `move` service (status only, conditional write) behind card move and Drop actions.
- Tests:
  - a moved item survives re-projection unchanged;
  - an untouched item is still replaced;
  - a reordered board-owned item creates no duplicate;
  - a reworded item yields a new `open` card;
  - a move changes only `metadata.status`, with every other field and the body byte-identical;
  - a stale `contentHash` produces one retry, then a reported conflict.

### Phase 3: Notes

- `addNote` service and the detail form.
- Tests: a note appends under `## Notes`; earlier body text and metadata are byte-identical; a noted item is board-owned.

### Phase 4: Attribution

- `move` and `addNote` record the actor; `move` appends history.
- Persist validator refuses unrecorded status changes.
- Chat tool over the same service.
- Tests:
  - a move from the workspace and one from the chat tool by the same person record the same identity;
  - the Blocked card shows who blocked it and when;
  - a generic update that changes status without a history entry is refused;
  - a non-status update passes.

### Phase 5: Projects

- Configurable grouping key; board project filter; per-project roll-up with blocked list.
- Tests: the filter shows only members; counts per column match fixtures; blocked cards appear in the roll-up; a membership set in Studio makes the item board-owned and survives re-projection; removing the grouping value leaves the items intact.

### Phase 6: Drag-and-drop

- Add a `board` block with a typed move action to the shared declarative vocabulary, rendered by the Studio host.
- The Board workspace switches to it; per-card move actions remain for keyboard and phone.
- Tests: renderer contract tests for the block, keyboard-accessible moves, and a mounted Studio test where dragging persists through the same `move` service.
