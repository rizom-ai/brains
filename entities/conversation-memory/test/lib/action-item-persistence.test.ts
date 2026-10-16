import { afterEach, describe, expect, it } from "bun:test";
import {
  EntityRegistry,
  EntityService,
  type EntityMutationResult,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createMockShell } from "@brains/plugins/test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { computeContentHash } from "@brains/utils/hash";
import {
  generateMarkdown,
  readMarkdownFrontmatter,
} from "@brains/utils/markdown-frontmatter";
import { z } from "@brains/utils/zod";
import { ActionItemAdapter } from "../../src/adapters/conversation-memory-adapters";
import {
  actionItemBody,
  actionItemBodyHash,
  isBoardOwned,
} from "../../src/lib/action-item-board";
import {
  addActionItemNote,
  moveActionItem,
  trackInboxItem,
} from "../../src/lib/action-item-moves";
import { createActionItemStatusValidator } from "../../src/lib/action-item-validator";
import {
  actionItemSchema,
  type ActionItemEntity,
  type ActionItemMetadata,
} from "../../src/schemas/conversation-memory";

const adapter = new ActionItemAdapter();
const niels = { kind: "user", userId: "u-niels" } as const;
const sam = { kind: "user", userId: "u-sam" } as const;
const ID = "conv-1:action-item:1:abc123abc123";
const at = (): Date => new Date("2026-10-15T08:02:00.000Z");

const metadata: ActionItemMetadata = {
  conversationId: "conv-1",
  channelId: "cli-terminal",
  interfaceType: "cli",
  spaceId: "cli:cli-terminal",
  timeRange: {
    start: "2026-01-01T00:00:00.000Z",
    end: "2026-01-01T00:01:00.000Z",
  },
  sourceSummaryId: "conv-1",
  sourceMessageCount: 2,
  projectionVersion: 1,
  status: "open",
};

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function brain(): Promise<EntityService> {
  const directory = await createTestDirectory();
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  registry.registerEntityType("action-item", actionItemSchema, adapter);
  // Throws unless action-item is an eligible grouping contributor.
  registry.registerGrouping({
    key: "projects",
    field: "projects",
    label: "Projects",
    types: ["action-item"],
  });
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
      dimensions: 1536,
      generateEmbedding: async () => {
        throw new Error("Unexpected embedding");
      },
      generateEmbeddings: async () => {
        throw new Error("Unexpected embedding");
      },
    },
  });
  await service.initialize();
  registry.registerPersistValidator(
    "action-item",
    createActionItemStatusValidator(service),
  );
  close = async (): Promise<void> => {
    service.close();
    await directory.cleanup();
  };
  await service.createEntity({
    entity: {
      id: ID,
      entityType: "action-item",
      visibility: "shared",
      content: projectedContent(),
      metadata,
    },
  });
  return service;
}

function projectedContent(): string {
  const title = "Action item: Book the venue";
  const text = "Book the venue for the spring gathering.";
  const projectedBodyHash = actionItemBodyHash(
    adapter.composeContent(title, text, metadata),
  );
  return adapter.composeContent(title, text, {
    ...metadata,
    projectedBodyHash,
  });
}

function frontmatterOf(content: string): Record<string, unknown> {
  return z
    .record(z.string(), z.unknown())
    .parse(readMarkdownFrontmatter(content).data);
}

async function stored(service: EntityService): Promise<ActionItemEntity> {
  const entity = await service.getEntity(
    { entityType: "action-item", id: ID, visibilityScope: "restricted" },
    actionItemSchema,
  );
  if (!entity) throw new Error("Missing action item");
  return entity;
}

async function group(service: EntityService, project: string): Promise<void> {
  const entity = await stored(service);
  await service.updateEntity({
    entity: {
      ...entity,
      content: generateMarkdown(
        { ...frontmatterOf(entity.content), projects: [project] },
        actionItemBody(entity.content),
      ),
    },
  });
}

describe("moving a stored card", () => {
  it("records the move and keeps the body and grouping membership", async () => {
    const service = await brain();
    await group(service, "Spring gathering");
    const before = await stored(service);

    const result = await moveActionItem(
      { entityService: service, now: at, visibilityScope: "restricted" },
      { id: ID, from: "open", to: "blocked", actor: niels },
    );

    expect(result.status).toBe("moved");
    const after = await stored(service);
    expect(after.metadata.status).toBe("blocked");
    expect(after.metadata.history).toEqual([
      {
        at: "2026-10-15T08:02:00.000Z",
        actor: niels,
        from: "open",
        to: "blocked",
      },
    ]);
    expect(actionItemBody(after.content)).toBe(actionItemBody(before.content));
    expect(frontmatterOf(after.content)["projects"]).toEqual([
      "Spring gathering",
    ]);
    expect(
      (
        await service.queryGroupingCatalog({
          grouping: "projects",
          entityTypes: ["action-item"],
          visibilityScope: "restricted",
        })
      ).values,
    ).toEqual([{ value: "Spring gathering", count: 1 }]);
  });

  it("reports a conflict instead of overriding someone else's move", async () => {
    const service = await brain();
    await moveActionItem(
      { entityService: service, now: at, visibilityScope: "restricted" },
      { id: ID, from: "open", to: "done", actor: sam },
    );

    const result = await moveActionItem(
      { entityService: service, now: at, visibilityScope: "restricted" },
      { id: ID, from: "open", to: "blocked", actor: niels },
    );

    expect(result).toEqual({ status: "conflict", current: "done" });
    expect((await stored(service)).metadata.status).toBe("done");
  });

  it("reapplies once when an unrelated edit lands between read and write", async () => {
    const service = await brain();
    let interleaved = false;
    const racing = {
      getEntity: service.getEntity.bind(service),
      updateEntity: async (
        ...args: Parameters<EntityService["updateEntity"]>
      ): Promise<EntityMutationResult> => {
        if (!interleaved) {
          interleaved = true;
          await group(service, "Spring gathering");
        }
        return service.updateEntity(...args);
      },
    };

    const result = await moveActionItem(
      { entityService: racing, now: at, visibilityScope: "restricted" },
      { id: ID, from: "open", to: "doing", actor: niels },
    );

    expect(result.status).toBe("moved");
    const after = await stored(service);
    expect(after.metadata.status).toBe("doing");
    expect(frontmatterOf(after.content)["projects"]).toEqual([
      "Spring gathering",
    ]);
  });

  it("gives up after a second conflict", async () => {
    const service = await brain();
    let writes = 0;
    const contested = {
      getEntity: service.getEntity.bind(service),
      updateEntity: async (): Promise<EntityMutationResult> => {
        writes += 1;
        return {
          entityId: ID,
          jobId: "",
          skipped: true,
          skipReason: "content-conflict",
        };
      },
    };

    const result = await moveActionItem(
      { entityService: contested, now: at, visibilityScope: "restricted" },
      { id: ID, from: "open", to: "doing", actor: niels },
    );

    expect(result).toEqual({ status: "conflict", current: "open" });
    expect(writes).toBe(2);
  });

  it("reports a card that no longer exists", async () => {
    const service = await brain();
    const result = await moveActionItem(
      { entityService: service, now: at, visibilityScope: "restricted" },
      { id: "missing", from: "open", to: "doing", actor: niels },
    );
    expect(result).toEqual({ status: "not-found" });
  });
});

describe("the status validator", () => {
  it("refuses a status change that carries no history entry", async () => {
    const service = await brain();
    const entity = await stored(service);
    const content = generateMarkdown(
      { ...frontmatterOf(entity.content), status: "done" },
      actionItemBody(entity.content),
    );

    expect(
      service.updateEntity({
        entity: {
          ...entity,
          content,
          contentHash: computeContentHash(content),
          metadata: { ...entity.metadata, status: "done" },
        },
      }),
    ).rejects.toThrow("history");
    expect((await stored(service)).metadata.status).toBe("open");
  });

  it("refuses a history entry that records a different transition", async () => {
    const service = await brain();
    const entity = await stored(service);
    const history = [
      {
        at: "2026-10-15T08:02:00.000Z",
        actor: niels,
        from: "doing",
        to: "done",
      },
    ];
    const content = generateMarkdown(
      { ...frontmatterOf(entity.content), status: "done", history },
      actionItemBody(entity.content),
    );

    expect(
      service.updateEntity({
        entity: {
          ...entity,
          content,
          contentHash: computeContentHash(content),
          metadata: { ...entity.metadata, status: "done" },
        },
      }),
    ).rejects.toThrow("history");
  });

  it("lets edits that leave status alone through", async () => {
    const service = await brain();
    await group(service, "Field guide");
    expect(frontmatterOf((await stored(service)).content)["projects"]).toEqual([
      "Field guide",
    ]);
  });
});

describe("noting a stored card", () => {
  it("keeps the note, passes the status validator, and claims the card for the board", async () => {
    const service = await brain();

    const result = await addActionItemNote(
      { entityService: service, now: at, visibilityScope: "restricted" },
      {
        id: ID,
        text: "Venue wants a deposit.",
        actor: niels,
        actorName: "Niels Ward",
      },
    );

    expect(result).toEqual({ status: "noted" });
    const after = await stored(service);
    expect(actionItemBody(after.content)).toContain(
      "## Notes\n\n- 2026-10-15 · Niels Ward — Venue wants a deposit.\n",
    );
    expect(after.metadata.status).toBe("open");
    expect(isBoardOwned(after)).toBe(true);
  });

  it("reports a card that no longer exists", async () => {
    const service = await brain();
    expect(
      await addActionItemNote(
        { entityService: service, now: at, visibilityScope: "restricted" },
        { id: "missing", text: "Hello.", actor: niels },
      ),
    ).toEqual({ status: "not-found" });
  });
});

describe("tracking an Inbox item", () => {
  const request = {
    sourceRef: {
      sourceId: "contact-requests",
      entityType: "contact-request",
      entityId: "req-1",
    },
    title: "Reply about the field notes",
    text: "Grace asks whether we would share our field notes.",
    assignee: "Alex Morgan",
    actor: niels,
    actorName: "Niels Ward",
  };

  it("creates an open card from the Inbox, naming who tracked it", async () => {
    const service = await brain();

    const result = await trackInboxItem(
      { entityService: service, now: at, visibility: "shared" },
      request,
    );

    expect(result).toEqual({
      status: "tracked",
      id: "inbox:contact-requests:req-1",
    });
    const card = await service.getEntity(
      {
        entityType: "action-item",
        id: "inbox:contact-requests:req-1",
        visibilityScope: "restricted",
      },
      actionItemSchema,
    );
    expect(card?.visibility).toBe("shared");
    expect(card?.metadata).toMatchObject({
      origin: "inbox",
      sourceRef: request.sourceRef,
      capturedAt: "2026-10-15T08:02:00.000Z",
      status: "open",
      assignedTo: [{ displayName: "Alex Morgan" }],
      requestedBy: [{ identity: niels, displayName: "Niels Ward" }],
    });
    expect(actionItemBody(card?.content ?? "")).toContain(
      "# Action item: Reply about the field notes",
    );
  });

  it("tracks an Inbox item once", async () => {
    const service = await brain();
    const deps = {
      entityService: service,
      now: at,
      visibility: "shared" as const,
    };
    await trackInboxItem(deps, request);

    expect(await trackInboxItem(deps, request)).toEqual({
      status: "already-tracked",
      id: "inbox:contact-requests:req-1",
    });
  });
});
