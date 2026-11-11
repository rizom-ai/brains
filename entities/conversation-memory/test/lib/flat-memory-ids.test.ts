import { afterEach, describe, expect, it } from "bun:test";
import {
  ActionItemAdapter,
  actionItemSchema,
  type ActionItemMetadata,
} from "@brains/action-items";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createMockShell } from "@brains/plugins/test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { DecisionAdapter } from "../../src/adapters/conversation-memory-adapters";
import { flattenMemoryIds } from "../../src/lib/flat-memory-ids";
import {
  decisionSchema,
  type DecisionEntity,
} from "../../src/schemas/conversation-memory";

const actionItems = new ActionItemAdapter();
const decisions = new DecisionAdapter();
const created = "2026-09-01T10:00:00.000Z";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function brain(): Promise<EntityService> {
  const directory = await createTestDirectory();
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  registry.registerEntityType("action-item", actionItemSchema, actionItems);
  registry.registerEntityType("decision", decisionSchema, decisions);
  const dbConfig = { url: `file:${directory.dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const service = EntityService.createFresh({
    dbConfig,
    embeddingDbConfig: { url: `file:${directory.dir}/embeddings.db` },
    entityRegistry: registry,
    logger,
    jobQueueService: createMockShell().getJobQueueService(),
    embeddingsEnabled: false,
    embeddingService: {
      identity: { model: "test:mock", dimensions: 1536, promptRevision: 0 },
      embedQuery: async () => {
        throw new Error("Unexpected embedding");
      },
      embedDocuments: async () => {
        throw new Error("Unexpected embedding");
      },
    },
  });
  await service.initialize();
  close = async (): Promise<void> => {
    service.close();
    await directory.cleanup();
  };
  return service;
}

async function storeCard(
  service: EntityService,
  id: string,
  title: string,
  metadata: ActionItemMetadata,
): Promise<void> {
  await service.createEntity({
    entity: {
      id,
      entityType: "action-item",
      visibility: "shared",
      created,
      updated: created,
      content: actionItems.composeContent(
        `Action item: ${title}`,
        title,
        metadata,
      ),
      metadata,
    },
  });
}

const fromBoard: ActionItemMetadata = {
  origin: "board",
  capturedAt: created,
  status: "open",
};

const fromInbox: ActionItemMetadata = {
  origin: "inbox",
  sourceRef: {
    sourceId: "contact-requests",
    entityType: "contact-request",
    entityId: "req-1",
  },
  capturedAt: created,
  status: "doing",
};

const fromConversation: ActionItemMetadata = {
  conversationId: "cli:session-7",
  interfaceType: "cli",
  channelId: "cli-terminal",
  capturedAt: created,
  status: "open",
};

const decided: DecisionEntity["metadata"] = {
  conversationId: "cli:session-7",
  channelId: "cli-terminal",
  interfaceType: "cli",
  timeRange: { start: created, end: created },
  status: "active",
};

async function storeDecision(
  service: EntityService,
  id: string,
): Promise<void> {
  await service.createEntity({
    entity: {
      id,
      entityType: "decision",
      visibility: "restricted",
      created,
      updated: created,
      content: decisions.composeContent(
        "Decision: Hold it in the old library",
        "Hold it in the old library.",
        decided,
      ),
      metadata: decided,
    },
  });
}

async function idsOf(
  service: EntityService,
  entityType: string,
): Promise<string[]> {
  const entities = await service.listEntities({
    entityType,
    options: { filter: { visibilityScope: "restricted" } },
  });
  return entities.map((entity) => entity.id).sort();
}

describe("flattening action item and decision ids", () => {
  it("moves each colon id to a flat one, keeping what the entity holds", async () => {
    const service = await brain();
    await storeCard(
      service,
      "board:OLqbIVsaQUHA",
      "Order name badges",
      fromBoard,
    );
    await storeCard(
      service,
      "inbox:contact-requests:req-1",
      "Reply about the field notes",
      fromInbox,
    );
    await storeCard(
      service,
      "cli:session-7:action-item:1:abc123abc123",
      "Ask the venue about access",
      fromConversation,
    );
    await storeCard(
      service,
      "already-flat-k3f9a2",
      "Book the venue",
      fromBoard,
    );
    await storeDecision(service, "cli:session-7:decision:1:def456def456");

    expect(await flattenMemoryIds(service)).toBe(4);

    const cards = await idsOf(service, "action-item");
    expect(cards).toContain("inbox-contact-requests-req-1");
    expect(cards).toContain("cli-session-7-action-item-1-abc123abc123");
    expect(cards).toContain("already-flat-k3f9a2");
    expect(
      cards.filter((id) => /^order-name-badges-[0-9a-z]{6}$/.test(id)),
    ).toHaveLength(1);
    expect(cards.filter((id) => id.includes(":"))).toEqual([]);
    expect(await idsOf(service, "decision")).toEqual([
      "cli-session-7-decision-1-def456def456",
    ]);

    const moved = await service.getEntity(
      {
        entityType: "action-item",
        id: "inbox-contact-requests-req-1",
        visibilityScope: "restricted",
      },
      actionItemSchema,
    );
    expect(moved?.visibility).toBe("shared");
    expect(moved?.created).toBe(created);
    expect(moved?.metadata).toMatchObject({
      origin: "inbox",
      status: "doing",
      sourceRef: fromInbox.sourceRef,
    });
    expect(moved?.content).toContain(
      "# Action item: Reply about the field notes",
    );
  });

  it("changes nothing the second time", async () => {
    const service = await brain();
    await storeCard(
      service,
      "board:OLqbIVsaQUHA",
      "Order name badges",
      fromBoard,
    );
    await flattenMemoryIds(service);
    const once = await idsOf(service, "action-item");

    expect(await flattenMemoryIds(service)).toBe(0);
    expect(await idsOf(service, "action-item")).toEqual(once);
  });

  it("finishes a move that stopped after writing the flat id", async () => {
    const service = await brain();
    await storeCard(
      service,
      "inbox:contact-requests:req-1",
      "Reply about the field notes",
      fromInbox,
    );
    await storeCard(
      service,
      "inbox-contact-requests-req-1",
      "Reply about the field notes",
      fromInbox,
    );

    expect(await flattenMemoryIds(service)).toBe(1);
    expect(await idsOf(service, "action-item")).toEqual([
      "inbox-contact-requests-req-1",
    ]);
  });
});
