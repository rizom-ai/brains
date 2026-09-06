import {
  defineSubscription,
  SYSTEM_CHANNELS,
  type AnySubscriptionDefinition,
} from "@brains/sdk/services";
import { ENTITY_CHANNELS, PUBLISH_CHANNELS } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { listCanonicalAtprotoLexicons } from "@brains/atproto-contracts";
import type { BaseEntity } from "@brains/sdk/entities";
import type { PublishingTaskQueue } from "./publishing-tasks";
import {
  BRAIN_CARD_COLLECTION,
  BRAIN_CARD_RKEY,
  type AtprotoAnnouncer,
  type AtprotoPublisher,
} from "./publisher";

const LEXICON_SCHEMA_COLLECTION = "com.atproto.lexicon.schema";
const BRAIN_CARD_TASK_KEY = `${BRAIN_CARD_COLLECTION}/${BRAIN_CARD_RKEY}`;
const BRAIN_CARD_INPUT_ENTITY_TYPES = new Set([
  "brain-character",
  "anchor-profile",
  "skill",
]);

const entityTriggerPayloadSchema = z.looseObject({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  entity: z
    .looseObject({
      visibility: z.string(),
    })
    .optional(),
});

type EntityTriggerPayload = z.output<typeof entityTriggerPayloadSchema>;

function entityTaskKey(payload: EntityTriggerPayload): string {
  return `${payload.entityType}/${payload.entityId}`;
}

/**
 * Whether this process saw a full boot.
 *
 * Startup-check boots run ready hooks but never broadcast pluginsRegistered;
 * only a full boot may write to the PDS. The subscription arms it, ready
 * reads it.
 */
export interface BootGate {
  fullBootObserved: boolean;
}

export interface AmbientPublishing {
  readonly publisher: AtprotoPublisher;
  readonly tasks: PublishingTaskQueue;
  readonly boot: BootGate;
}

const brainCardDetails = {
  operation: "publish-card",
  entityType: "brain-card",
  entityId: BRAIN_CARD_RKEY,
  collection: BRAIN_CARD_COLLECTION,
} as const;

/** Queue a brain card upsert; a failure is announced, never thrown. */
export function scheduleBrainCardPublish(
  ambient: AmbientPublishing,
  announce: AtprotoAnnouncer,
): Promise<void> {
  return ambient.tasks.run(BRAIN_CARD_TASK_KEY, () =>
    ambient.tasks.runTrigger(announce, brainCardDetails, () =>
      ambient.publisher.publishBrainCard(),
    ),
  );
}

/**
 * Upsert every canonical `ai.rizom.brain.*` schema from this repo, one
 * record per lexicon under a stable key so repeated boots converge. One
 * schema failing is reported and the rest still go out.
 */
export function publishCanonicalLexiconSchemas(
  ambient: AmbientPublishing,
  announce: AtprotoAnnouncer,
): Promise<void> {
  return ambient.tasks.runTrigger(
    announce,
    {
      operation: "upsert-record",
      entityType: "lexicon-schema",
      entityId: "*",
      collection: LEXICON_SCHEMA_COLLECTION,
    },
    async () => {
      const session = await ambient.publisher.authenticatedClient();
      if (!session) {
        throw new Error(
          "AT Protocol publishing requires identifier and app password configuration",
        );
      }
      const { client, repo } = session;
      if (!client.putRecord) {
        throw new Error(
          "AT Protocol PDS client does not support record upserts",
        );
      }
      const putRecord = client.putRecord.bind(client);

      await listCanonicalAtprotoLexicons().reduce<Promise<void>>(
        async (previous, lexicon) => {
          await previous;
          await ambient.tasks.runTrigger(
            announce,
            {
              operation: "upsert-record",
              entityType: "lexicon-schema",
              entityId: lexicon.id,
              collection: LEXICON_SCHEMA_COLLECTION,
            },
            () =>
              putRecord({
                repo,
                collection: LEXICON_SCHEMA_COLLECTION,
                rkey: lexicon.id,
                record: {
                  $type: LEXICON_SCHEMA_COLLECTION,
                  ...lexicon,
                },
              }),
          );
        },
        Promise.resolve(),
      );
    },
  );
}

async function reconcileProjectedEntity(
  ambient: AmbientPublishing,
  announce: AtprotoAnnouncer,
  payload: EntityTriggerPayload,
): Promise<void> {
  const { publisher, tasks } = ambient;
  const projection = publisher.projectionFor(payload.entityType);
  if (!projection || !publisher.hasPublishingCredentials()) return;

  const details = {
    entityType: payload.entityType,
    entityId: payload.entityId,
    collection: projection.collection,
  };

  // An unreadable entity is a failure to report, not a reason to delete
  // its record: the record may still be right.
  let entity: BaseEntity | null;
  try {
    entity = await publisher.readEntity({
      entityType: payload.entityType,
      id: payload.entityId,
    });
  } catch (error) {
    await tasks.reportFailure(
      announce,
      { operation: "upsert-record", ...details },
      error,
    );
    return;
  }

  if (entity?.visibility === "public") {
    await tasks.runTrigger(
      announce,
      { operation: "upsert-record", ...details },
      () =>
        publisher.publishEntity({
          entityType: payload.entityType,
          entityId: payload.entityId,
        }),
    );
    return;
  }

  await tasks.runTrigger(
    announce,
    { operation: "delete-record", ...details },
    () => publisher.deleteProjectedRecord(projection, payload.entityId),
  );
}

async function deleteProjectedEntityFromTrigger(
  ambient: AmbientPublishing,
  announce: AtprotoAnnouncer,
  payload: EntityTriggerPayload,
): Promise<void> {
  const { publisher, tasks } = ambient;
  const projection = publisher.projectionFor(payload.entityType);
  if (
    !projection ||
    !publisher.hasPublishingCredentials() ||
    (payload.entity && payload.entity.visibility !== "public")
  ) {
    return;
  }

  await tasks.runTrigger(
    announce,
    {
      operation: "delete-record",
      entityType: payload.entityType,
      entityId: payload.entityId,
      collection: projection.collection,
    },
    () => publisher.deleteProjectedRecord(projection, payload.entityId),
  );
}

/**
 * The bus signals ambient publishing follows.
 *
 * Handlers queue the work and return at once: an entity event must not wait
 * on a PDS. publish:report:success is a request the publish pipeline
 * consumes; publish:completed is its broadcast fan-out, which is what a
 * mirror listens to.
 */
export function ambientSubscriptions(
  ambient: AmbientPublishing,
): AnySubscriptionDefinition[] {
  const { tasks, boot } = ambient;
  return [
    defineSubscription({
      topic: SYSTEM_CHANNELS.pluginsRegistered,
      payload: z.looseObject({}),
      handle: () => {
        boot.fullBootObserved = true;
        return {};
      },
    }),
    defineSubscription({
      topic: PUBLISH_CHANNELS.completed,
      payload: entityTriggerPayloadSchema,
      handle: ({ payload, messaging }) => {
        void tasks.run(entityTaskKey(payload), () =>
          reconcileProjectedEntity(ambient, messaging, payload),
        );
        return {};
      },
    }),
    defineSubscription({
      topic: ENTITY_CHANNELS.updated,
      payload: entityTriggerPayloadSchema,
      handle: ({ payload, messaging }) => {
        void tasks.run(entityTaskKey(payload), () =>
          reconcileProjectedEntity(ambient, messaging, payload),
        );
        if (
          boot.fullBootObserved &&
          BRAIN_CARD_INPUT_ENTITY_TYPES.has(payload.entityType)
        ) {
          void scheduleBrainCardPublish(ambient, messaging);
        }
        return {};
      },
    }),
    defineSubscription({
      topic: ENTITY_CHANNELS.deleted,
      payload: entityTriggerPayloadSchema,
      handle: ({ payload, messaging }) => {
        void tasks.run(entityTaskKey(payload), () =>
          deleteProjectedEntityFromTrigger(ambient, messaging, payload),
        );
        return {};
      },
    }),
  ];
}

export { LEXICON_SCHEMA_COLLECTION };
