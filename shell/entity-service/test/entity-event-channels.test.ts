import { describe, expect, test } from "bun:test";
import { ENTITY_CHANNELS } from "@brains/contracts";
import { createMockProgressReporter } from "@brains/test-utils";
import { createMockEntityService, createTestEntity } from "../src/test/index";
import {
  embeddingReadyChannel,
  entityCreatedChannel,
  entityDeletedChannel,
  entityUpdatedChannel,
} from "../src/entity-event-channels";
import { EmbeddingJobHandler } from "../src/handlers/embeddingJobHandler";
import type {
  BaseEntity,
  EntityEventBus,
  EntityMutationEventContext,
} from "../src/types";
import { mockEmbeddingService } from "./helpers/mock-services";
import { setupEntityService } from "./helpers/setup-entity-service";
import {
  createNoteInput,
  noteAdapter,
  noteSchema,
} from "./helpers/test-schemas";

interface CapturedEvent {
  type: string;
  payload: unknown;
}

function capturingBus(): { bus: EntityEventBus; events: CapturedEvent[] } {
  const events: CapturedEvent[] = [];
  return {
    events,
    bus: {
      send: async (request): Promise<{ success: true }> => {
        events.push({ type: request.type, payload: request.payload });
        return { success: true };
      },
    },
  };
}

const changeChannels = [
  entityCreatedChannel,
  entityUpdatedChannel,
  entityDeletedChannel,
];

function parsedEvent(
  event: CapturedEvent | undefined,
): ReturnType<typeof entityCreatedChannel.schema.safeParse> {
  const channel = changeChannels.find(({ name }) => name === event?.type);
  if (!event || !channel) {
    throw new Error(`No entity change event: ${event?.type}`);
  }
  return channel.schema.safeParse(event.payload);
}

// A channel is the contract between the entity service and every plugin that
// follows its changes: what the service sends must be what the channel takes.
describe("entity change channels", () => {
  test("name the entity events", () => {
    expect(entityCreatedChannel.name).toBe(ENTITY_CHANNELS.created);
    expect(entityUpdatedChannel.name).toBe(ENTITY_CHANNELS.updated);
    expect(entityDeletedChannel.name).toBe(ENTITY_CHANNELS.deleted);
    expect(embeddingReadyChannel.name).toBe(ENTITY_CHANNELS.embeddingReady);
  });

  test("take every change the service sends, with its context and entity", async () => {
    const { bus, events } = capturingBus();
    const ctx = await setupEntityService(
      [{ name: "note", schema: noteSchema, adapter: noteAdapter }],
      { messageBus: bus },
    );
    try {
      const eventContext: EntityMutationEventContext = {
        conversationId: "conversation-1",
        channelId: "channel-1",
        runId: "playbook_run_1",
        toolCallId: "tool-call-1",
        actor: { kind: "user", userId: "usr_editor" },
        interfaceType: "studio",
      };
      const { entityId } = await ctx.entityService.createEntity({
        entity: {
          ...createNoteInput({
            title: "Channel Note",
            content: "Body",
            tags: [],
          }),
          metadata: { seriesName: "Old" },
        },
        options: { eventContext },
      });
      const original = await ctx.entityService.getEntity(
        { entityType: "note", id: entityId },
        noteSchema,
      );
      if (!original) throw new Error("Entity should exist");
      await ctx.entityService.updateEntity({
        entity: {
          ...original,
          content: "Changed",
          metadata: { seriesName: "New" },
        },
        options: { eventContext },
      });
      await ctx.entityService.deleteEntity({
        entityType: "note",
        id: entityId,
        options: { eventContext },
      });

      expect(events.map((event) => event.type)).toEqual([
        ENTITY_CHANNELS.created,
        ENTITY_CHANNELS.updated,
        ENTITY_CHANNELS.deleted,
      ]);
      for (const event of events) {
        const parsed = parsedEvent(event);
        if (!parsed.success) throw new Error(parsed.error.message);
        expect(parsed.data).toMatchObject({
          entityType: "note",
          entityId,
          ...eventContext,
        });
        // An entity type's own top-level fields reach the subscriber too.
        expect(parsed.data.entity).toMatchObject({
          id: entityId,
          entityType: "note",
          title: "Channel Note",
        });
      }
      const updated = parsedEvent(events[1]);
      expect(updated.success && updated.data.previousMetadata).toEqual({
        seriesName: "Old",
      });
    } finally {
      await ctx.cleanup();
    }
  });

  test("take a projection's change, which names only the entity", async () => {
    const { bus, events } = capturingBus();
    const ctx = await setupEntityService(
      [{ name: "note", schema: noteSchema, adapter: noteAdapter }],
      { messageBus: bus },
    );
    try {
      await ctx.entityService.reconcileProjectionTargets([
        {
          entityType: "note",
          entityId: "projected",
          operation: "upsert",
          contentHash: "hash",
        },
        { entityType: "note", entityId: "retired", operation: "delete" },
      ]);

      expect(events.map((event) => parsedEvent(event))).toEqual([
        { success: true, data: { entityType: "note", entityId: "projected" } },
        { success: true, data: { entityType: "note", entityId: "retired" } },
      ]);
    } finally {
      await ctx.cleanup();
    }
  });

  test.each([
    ["no entity id", { entityType: "note" }],
    ["an empty entity type", { entityType: "", entityId: "a" }],
    [
      "an entity without its content",
      { entityType: "note", entityId: "a", entity: { id: "a" } },
    ],
  ])("refuse a change with %s", (_case, payload) => {
    expect(entityUpdatedChannel.schema.safeParse(payload).success).toBe(false);
  });
});

describe("embedding ready channel", () => {
  test("takes what the embedding job sends once the embedding is stored", async () => {
    const entity = createTestEntity<BaseEntity>("note", {
      id: "embedded",
      content: "Body",
    });
    const { bus, events } = capturingBus();
    const handler = EmbeddingJobHandler.createFresh(
      createMockEntityService({ getEntityImpl: async () => entity }),
      mockEmbeddingService,
      bus,
    );

    await handler.process(
      {
        id: "embedded",
        entityType: "note",
        contentHash: entity.contentHash,
        operation: "create",
      },
      "job-1",
      createMockProgressReporter(),
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe(embeddingReadyChannel.name);
    expect(embeddingReadyChannel.schema.safeParse(events[0]?.payload)).toEqual({
      success: true,
      data: { entityType: "note", entityId: "embedded", entity: { ...entity } },
    });
  });
});
