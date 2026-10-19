import { actorRefKey, type ActorRef } from "@brains/contracts";
import type { EntityPluginContext } from "@brains/plugins";
import { ACTION_ITEM_ENTITY_TYPE } from "./constants";
import {
  actionItemSchema,
  type ActionItemEntity,
  type ActionItemNoteEntry,
} from "./schema";

type PersistValidator = Parameters<
  EntityPluginContext["entities"]["registerPersistValidator"]
>[1];

function who(actor: ActorRef): string {
  return actorRefKey(actor).replace(/^user:/, "");
}

/**
 * A status change must arrive with the one history entry that records it, so
 * no write path (a Studio save, the generic update tool, a file import) can
 * move a card without saying who did.
 */
function checkStatus(
  previous: ActionItemEntity,
  next: ActionItemEntity,
  actor: ActorRef | undefined,
): void {
  const from = previous.metadata.status;
  const to = next.metadata.status;
  if (from === to) return;
  const recorded = next.metadata.history ?? [];
  const latest = recorded.at(-1);
  const matches =
    recorded.length === (previous.metadata.history?.length ?? 0) + 1 &&
    latest?.from === from &&
    latest.to === to;
  if (!matches) {
    throw new Error(
      `Action item ${next.id} moved from ${from} to ${to} without a matching history entry; move it on the board so the change is recorded`,
    );
  }
  // A named writer must be the one the entry names; writes without an
  // actor (imports, system jobs) are checked for the entry alone.
  if (actor && actorRefKey(latest.actor) !== actorRefKey(actor)) {
    throw new Error(
      `Action item ${next.id}: the recorded move names ${who(latest.actor)}, but ${who(actor)} is writing it`,
    );
  }
}

function sameNote(a: ActionItemNoteEntry, b: ActionItemNoteEntry): boolean {
  return (
    a.at === b.at &&
    actorRefKey(a.actor) === actorRefKey(b.actor) &&
    a.displayName === b.displayName &&
    a.text === b.text
  );
}

/** Notes are a log: written ones stay as written, and a new one names its writer. */
function checkNotes(
  previous: ActionItemEntity,
  next: ActionItemEntity,
  actor: ActorRef | undefined,
): void {
  const kept = previous.metadata.notes ?? [];
  const notes = next.metadata.notes ?? [];
  const intact =
    notes.length >= kept.length &&
    kept.every((note, index) => {
      const stored = notes[index];
      return stored !== undefined && sameNote(note, stored);
    });
  if (!intact) {
    throw new Error(
      `Action item ${next.id}: written notes cannot be changed or removed; add a new note instead`,
    );
  }
  const added = notes.slice(kept.length);
  const foreign = actor
    ? added.find((note) => actorRefKey(note.actor) !== actorRefKey(actor))
    : undefined;
  if (actor && foreign) {
    throw new Error(
      `Action item ${next.id}: the new note names ${who(foreign.actor)}, but ${who(actor)} is writing it`,
    );
  }
}

/** Guards the fields that record who did what on a card: its moves and its notes. */
export function createActionItemValidator(
  entityService: Pick<EntityPluginContext["entityService"], "getEntity">,
): PersistValidator {
  return async (entity, { operation, actor }) => {
    if (operation !== "update") return;
    // Shape errors are the schema's to report; this guards changes only.
    const next = actionItemSchema.safeParse(entity);
    if (!next.success) return;
    const previous = await entityService.getEntity(
      {
        entityType: ACTION_ITEM_ENTITY_TYPE,
        id: entity.id,
        visibilityScope: "restricted",
      },
      actionItemSchema,
    );
    if (!previous) return;
    checkStatus(previous, next.data, actor);
    checkNotes(previous, next.data, actor);
  };
}
