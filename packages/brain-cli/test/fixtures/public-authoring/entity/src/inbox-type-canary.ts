import {
  defineEntity,
  z,
  type EntityDefinition,
  type EntityInboxActionContext,
  type EntityInboxChange,
  type EntityInboxDeclaration,
  type EntityInboxDetailContext,
  type EntityInboxEdits,
  type EntityInboxListContext,
  type EntityOf,
  type EntityRecordReader,
  type InboxAction,
  type InboxActor,
  type InboxFacetDefinition,
  type InboxItem,
  type InboxItemDetail,
} from "@rizom/brain/entities";
import { bookmark } from "./index";

// Compile-only: checked by the fixture typecheck, never loaded by the brain.
const recommendationMetadata = z.object({
  title: z.string(),
  bookmarkId: z.string(),
  status: z.enum(["waiting", "kept"]).default("waiting"),
});

type Recommendation = EntityDefinition<
  "recommendation",
  typeof recommendationMetadata
>;

const reviewActions: readonly InboxAction[] = [
  { id: "keep", label: "Keep" },
  { id: "discard", label: "Discard", confirm: true },
];

const bySource: InboxFacetDefinition = {
  key: "source",
  label: "Source",
  values: [{ value: "friend", label: "A friend" }],
};

function toItem(entity: EntityOf<Recommendation>): InboxItem {
  return {
    id: entity.id,
    title: entity.metadata.title,
    receivedAt: entity.updated,
    urgency: "normal",
    entityRef: { entityType: "recommendation", entityId: entity.id },
    facets: { source: "friend" },
    actions: [...reviewActions],
  };
}

async function listWaiting(
  context: EntityInboxListContext<Recommendation>,
): Promise<readonly InboxItem[]> {
  const waiting = await context.records.list({ limit: 100 });
  return waiting
    .filter(({ metadata }) => metadata.status === "waiting")
    .map(toItem);
}

async function describeRecommendation(
  itemId: string,
  context: EntityInboxDetailContext<Recommendation>,
): Promise<InboxItemDetail> {
  context.signal.throwIfAborted();
  const found = await context.records.get(itemId);
  const saved = found
    ? await context.entities.get(bookmark, found.metadata.bookmarkId)
    : null;
  return {
    kind: "plain",
    text: saved ? `${saved.metadata.title}: ${saved.metadata.url}` : "Gone.",
    truncated: false,
  };
}

function keep(
  record: EntityOf<Recommendation>,
): EntityInboxChange<Recommendation> {
  return { metadata: { ...record.metadata, status: "kept" } };
}

async function settle(
  records: EntityRecordReader<EntityOf<Recommendation>>,
  edits: EntityInboxEdits<Recommendation>,
  actor: InboxActor,
  itemId: string,
  actionId: string,
): Promise<void> {
  const found = await records.get(itemId);
  if (!found) throw new Error(`Nothing to settle for ${actor.permissionLevel}`);
  if (actionId === "discard") return edits.delete(found);
  return edits.update(found, keep(found));
}

const recommendationInbox: EntityInboxDeclaration<Recommendation> = {
  sourceId: "recommendations",
  displayName: "Recommendations",
  facets: [bySource],
  list: listWaiting,
  resolveDetail: describeRecommendation,
  act: async (
    itemId,
    actionId,
    context: EntityInboxActionContext<Recommendation>,
  ) => settle(context.records, context.edits, context.actor, itemId, actionId),
};

export const recommendation = defineEntity({
  type: "recommendation",
  purpose: "A page a friend recommended, waiting to be kept or discarded.",
  metadata: recommendationMetadata,
  inbox: recommendationInbox,
});

// Declared inline, the records and edits are the type's own.
export const tip = defineEntity({
  type: "tip",
  purpose: "A reading tip the operator approves.",
  metadata: z.object({ text: z.string(), approved: z.boolean() }),
  inbox: {
    sourceId: "tips",
    displayName: "Tips",
    list: async ({ records }) =>
      (await records.list()).map(({ id, metadata, updated }) => ({
        id,
        title: metadata.text,
        receivedAt: updated,
        urgency: "high",
        actions: [{ id: "approve", label: "Approve" }],
      })),
    act: async (itemId, _actionId, { records, edits }) => {
      const found = await records.get(itemId);
      if (found) {
        await edits.publish(found, {
          metadata: { ...found.metadata, approved: true },
        });
      }
    },
  },
});

export const invalidChange: EntityInboxChange<Recommendation> = {
  // @ts-expect-error A change writes the type's own metadata.
  metadata: { title: "Missing its bookmark" },
};

export const invalidItem: InboxItem = {
  id: "invalid",
  title: "Invalid",
  receivedAt: "2026-01-01T00:00:00.000Z",
  // @ts-expect-error Urgency is high or normal.
  urgency: "someday",
  actions: [],
};
