import {
  ACTION_ITEM_ENTITY_TYPE,
  actionItemSchema,
  actionItemTitle,
  boardCardId,
  flatId,
} from "@brains/action-items";
import type { BaseEntity, EntityPluginContext } from "@brains/plugins";
import { computeContentHash } from "@brains/utils/hash";
import { DECISION_ENTITY_TYPE } from "./constants";

/*
 * Action items and decisions once had colon-separated ids (legacy), which
 * directory sync stores as nested folders: "board:<id>",
 * "inbox:<source>:<entity>" and "<conversation>:<type>:<n>:<hash>". Once
 * startup content settles, each moves to its flat id; see
 * docs/legacy-code-inventory.json.
 */

type MemoryEntityService = Pick<
  EntityPluginContext["entityService"],
  "listEntities" | "getEntity" | "createEntity" | "deleteEntity"
>;

const EVERY_VISIBILITY = { filter: { visibilityScope: "restricted" } } as const;

/**
 * The flat id a colon id moves to: a hand-added card is named after its
 * title. The same every time, so a move that stopped half way is finished.
 */
function flatIdOf(entity: BaseEntity): string {
  if (!entity.id.startsWith("board:")) return flatId(entity.id);
  const card = actionItemSchema.parse(entity);
  return boardCardId(
    actionItemTitle(card),
    computeContentHash(entity.id).slice(0, 6),
  );
}

async function moveToFlatId(
  entityService: MemoryEntityService,
  entity: BaseEntity,
): Promise<void> {
  const id = flatIdOf(entity);
  const moved = await entityService.getEntity({
    entityType: entity.entityType,
    id,
    visibilityScope: "restricted",
  });
  if (!moved) {
    await entityService.createEntity({
      entity: {
        id,
        entityType: entity.entityType,
        content: entity.content,
        metadata: entity.metadata,
        visibility: entity.visibility,
        created: entity.created,
        updated: entity.updated,
      },
    });
  }
  await entityService.deleteEntity({
    entityType: entity.entityType,
    id: entity.id,
  });
}

/** Move every stored action item and decision with a colon id to its flat id. */
export async function flattenMemoryIds(
  entityService: MemoryEntityService,
): Promise<number> {
  const stored = await Promise.all(
    [ACTION_ITEM_ENTITY_TYPE, DECISION_ENTITY_TYPE].map((entityType) =>
      entityService.listEntities({ entityType, options: EVERY_VISIBILITY }),
    ),
  );
  const nested = stored.flat().filter((entity) => entity.id.includes(":"));
  await nested.reduce<Promise<void>>(
    (previous, entity) =>
      previous.then(() => moveToFlatId(entityService, entity)),
    Promise.resolve(),
  );
  return nested.length;
}
