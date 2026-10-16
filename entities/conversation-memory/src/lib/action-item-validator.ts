import { actorRefKey } from "@brains/contracts";
import type { EntityPluginContext } from "@brains/plugins";
import { ACTION_ITEM_ENTITY_TYPE } from "./constants";
import { actionItemSchema } from "../schemas/conversation-memory";

type PersistValidator = Parameters<
  EntityPluginContext["entities"]["registerPersistValidator"]
>[1];

/**
 * A status change must arrive with the one history entry that records it, so
 * no write path (a Studio save, the generic update tool, a file import) can
 * move a card without saying who did.
 */
export function createActionItemStatusValidator(
  entityService: Pick<EntityPluginContext["entityService"], "getEntity">,
): PersistValidator {
  return async (entity, { operation, actor }) => {
    if (operation !== "update") return;
    // Shape errors are the schema's to report; this guards transitions only.
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
    const from = previous.metadata.status;
    const to = next.data.metadata.status;
    if (from === to) return;
    const recorded = next.data.metadata.history ?? [];
    const latest = recorded.at(-1);
    const matches =
      recorded.length === (previous.metadata.history?.length ?? 0) + 1 &&
      latest?.from === from &&
      latest.to === to;
    if (!matches) {
      throw new Error(
        `Action item ${entity.id} moved from ${from} to ${to} without a matching history entry; move it on the board so the change is recorded`,
      );
    }
    // A named writer must be the one the entry names; writes without an
    // actor (imports, system jobs) are checked for the entry alone.
    if (actor && actorRefKey(latest.actor) !== actorRefKey(actor)) {
      throw new Error(
        `Action item ${entity.id}: the recorded move names ${actorRefKey(latest.actor).replace(/^user:/, "")}, but ${actorRefKey(actor).replace(/^user:/, "")} is writing it`,
      );
    }
  };
}
