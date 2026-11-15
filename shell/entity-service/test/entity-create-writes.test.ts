import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createClient } from "@libsql/client";
import { computeContentHash } from "@brains/utils/hash";
import { z } from "@brains/utils/zod";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import { minimalTestAdapter, minimalTestSchema } from "./helpers/test-schemas";
import type { EntityMutationReceipt } from "../src/entity-mutation-receipt";
import type {
  BaseEntity,
  EntityEventBus,
  EntityMutationEventContext,
  EntityWriteSnapshot,
} from "../src/types";

type SentEvent = Parameters<EntityEventBus["send"]>[0];

const journaledDirtyInputSchema = z
  .object({
    generation: z.number(),
    source_type: z.string(),
    source_id: z.string(),
    revision: z.string(),
    operation: z.enum(["upsert", "delete"]),
    marked_at: z.number(),
  })
  .transform((row) => ({
    generation: row.generation,
    sourceType: row.source_type,
    sourceId: row.source_id,
    revision: row.revision,
    operation: row.operation,
    markedAt: row.marked_at,
  }));
type JournaledDirtyInput = z.output<typeof journaledDirtyInputSchema>;

const eventContext: EntityMutationEventContext = {
  conversationId: "conversation-1",
  channelId: "channel-1",
  runId: "create-run",
  toolCallId: "tool-call-1",
  actor: { kind: "user", userId: "editor" },
  interfaceType: "studio",
};
const created = "2026-01-02T03:04:05.000Z";
const updated = "2026-01-03T03:04:05.000Z";

function entityInput(
  id: string,
  content = "Original answer",
): {
  id: string;
  entityType: "test";
  visibility: "restricted";
  content: string;
  metadata: Record<string, unknown>;
  created: string;
  updated: string;
} {
  return {
    id,
    entityType: "test",
    visibility: "restricted",
    content,
    metadata: { clientId: "editor" },
    created,
    updated,
  };
}

/** The input with the content hash a write computes from its content. */
function hashedEntity(id: string, content = "Original answer"): BaseEntity {
  return {
    ...entityInput(id, content),
    contentHash: computeContentHash(content),
  };
}

describe("entity writes: receipts, events and dirty inputs (real SQLite)", () => {
  let ctx: EntityServiceTestContext;
  let events: SentEvent[];
  let startedAt: number;

  beforeEach(async () => {
    events = [];
    ctx = await setupEntityService(
      [
        {
          name: "test",
          schema: minimalTestSchema,
          adapter: minimalTestAdapter,
        },
      ],
      {
        embeddingsEnabled: false,
        messageBus: {
          send: async (event) => {
            events.push(event);
          },
        },
      },
    );
    await ctx.entityService.initialize();
    startedAt = Date.now();
  });
  afterEach(async () => {
    ctx.entityService.close();
    await ctx.cleanup();
  });

  async function snapshot(id: string): Promise<EntityWriteSnapshot> {
    const current = await ctx.entityService.getEntityWriteSnapshot({
      entityType: "test",
      id,
      visibilityScope: "restricted",
    });
    if (!current) throw new Error(`Missing test entity ${id}`);
    return current;
  }

  /** Every journaled row in write order; pending reads coalesce per source. */
  async function dirtyJournal(): Promise<JournaledDirtyInput[]> {
    const client = createClient({ url: ctx.dbConfig.url });
    try {
      const { rows } = await client.execute(
        "SELECT * FROM projection_dirty_inputs ORDER BY generation",
      );
      return z.array(journaledDirtyInputSchema).parse(rows);
    } finally {
      client.close();
    }
  }

  function dirty(
    sourceId: string,
    revision: string,
    operation: "upsert" | "delete",
  ): JournaledDirtyInput {
    return {
      generation: expect.any(Number),
      sourceType: "test",
      sourceId,
      revision,
      operation,
      markedAt: expect.any(Number),
    };
  }

  function expectMarkedSinceStart(inputs: JournaledDirtyInput[]): void {
    for (const input of inputs) {
      expect(input.markedAt).toBeGreaterThanOrEqual(startedAt);
      expect(input.markedAt).toBeLessThanOrEqual(Date.now());
    }
  }

  test("a receipted create records its receipt, created event and upsert dirty input", async () => {
    const key = { namespace: "create-writes", key: "first" };
    const result = await ctx.entityService.applyEntityMutationOnce({
      receipt: key,
      operation: "create",
      request: { entity: entityInput("target"), options: { eventContext } },
    });

    const receipt: EntityMutationReceipt = {
      operation: "create",
      entityType: "test",
      entityId: "target",
    };
    expect(result).toEqual(receipt);
    expect(await ctx.entityService.getEntityMutationReceipt(key)).toEqual(
      receipt,
    );
    expect(events).toEqual([
      {
        type: "entity:created",
        sender: "entity-service",
        broadcast: true,
        payload: {
          entityType: "test",
          entityId: "target",
          ...eventContext,
          entity: hashedEntity("target"),
        },
      },
    ]);
    const inputs = await dirtyJournal();
    expect(inputs).toEqual([
      dirty("target", (await snapshot("target")).revision, "upsert"),
    ]);
    expectMarkedSinceStart(inputs);
  });

  test("a deduplicated create reports, emits and journals the final ID", async () => {
    await ctx.entityService.createEntity({ entity: entityInput("taken") });
    events.length = 0;

    const result = await ctx.entityService.createEntity({
      entity: entityInput("taken", "Second answer"),
      options: { deduplicateId: true, eventContext },
    });

    expect(result).toEqual({ entityId: "taken-2", jobId: "", skipped: false });
    expect(events).toEqual([
      {
        type: "entity:created",
        sender: "entity-service",
        broadcast: true,
        payload: {
          entityType: "test",
          entityId: "taken-2",
          ...eventContext,
          entity: hashedEntity("taken-2", "Second answer"),
        },
      },
    ]);
    const inputs = await dirtyJournal();
    expect(inputs).toEqual([
      dirty("taken", (await snapshot("taken")).revision, "upsert"),
      dirty("taken-2", (await snapshot("taken-2")).revision, "upsert"),
    ]);
    expectMarkedSinceStart(inputs);
  });

  test("an update journals an upsert of its new revision and emits previous metadata", async () => {
    await ctx.entityService.createEntity({ entity: entityInput("target") });
    const before = await dirtyJournal();
    events.length = 0;

    await ctx.entityService.updateEntity({
      entity: {
        ...hashedEntity("target", "Revised answer"),
        metadata: { clientId: "reviewer" },
      },
      options: { eventContext },
    });

    const after = await dirtyJournal();
    expect(after.slice(before.length)).toEqual([
      dirty("target", (await snapshot("target")).revision, "upsert"),
    ]);
    expectMarkedSinceStart(after);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "entity:updated",
      payload: {
        entityType: "test",
        entityId: "target",
        ...eventContext,
        entity: { id: "target", metadata: { clientId: "reviewer" } },
        previousMetadata: { clientId: "editor" },
      },
    });
  });

  test("a fold journals the target upsert, then the source delete of its expected revision", async () => {
    await ctx.entityService.createEntity({ entity: entityInput("source") });
    await ctx.entityService.createEntity({ entity: entityInput("target") });
    const source = await snapshot("source");
    const target = await snapshot("target");
    const before = await dirtyJournal();
    events.length = 0;

    await ctx.entityService.foldEntity({
      source: {
        entityType: "test",
        id: "source",
        expectedRevision: source.revision,
      },
      targetRevision: target.revision,
      entity: hashedEntity("target", "Merged answer"),
      options: { eventContext },
    });

    const after = await dirtyJournal();
    expect(after.slice(before.length)).toEqual([
      dirty("target", (await snapshot("target")).revision, "upsert"),
      dirty("source", `deleted:${source.revision}`, "delete"),
    ]);
    expectMarkedSinceStart(after);
    expect(events.map((event) => event.type)).toEqual([
      "entity:deleted",
      "entity:updated",
    ]);
    expect(events[0]?.payload).toEqual({
      entityType: "test",
      entityId: "source",
      ...eventContext,
      entity: source.entity,
    });
  });

  test("a delete journals the deleted revision and emits the prior entity", async () => {
    await ctx.entityService.createEntity({ entity: entityInput("target") });
    const prior = await snapshot("target");
    const before = await dirtyJournal();
    events.length = 0;

    expect(
      await ctx.entityService.deleteEntity({
        entityType: "test",
        id: "target",
        options: { eventContext },
      }),
    ).toBe(true);

    const after = await dirtyJournal();
    expect(after.slice(before.length)).toEqual([
      dirty("target", `deleted:${prior.revision}`, "delete"),
    ]);
    expectMarkedSinceStart(after);
    expect(events).toEqual([
      {
        type: "entity:deleted",
        sender: "entity-service",
        broadcast: true,
        payload: {
          entityType: "test",
          entityId: "target",
          ...eventContext,
          entity: prior.entity,
        },
      },
    ]);
  });
});
