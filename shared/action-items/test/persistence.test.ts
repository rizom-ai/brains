import { afterEach, describe, expect, it } from "bun:test";
import {
  EntityRegistry,
  EntityService,
  type EntityMutationResult,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createMockShell } from "@brains/plugins/test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import {
  generateMarkdown,
  readMarkdownFrontmatter,
} from "@brains/utils/markdown-frontmatter";
import { z } from "@brains/utils/zod";
import { ActionItemAdapter } from "../src";
import { actionItemBody, actionItemBodyHash, isBoardOwned } from "../src";
import {
  actionItemSource,
  addActionItemNote,
  createBoardCard,
  moveActionItem,
  trackInboxItem,
} from "../src";
import {
  actionItemSchema,
  type ActionItemEntity,
  type ActionItemMetadata,
} from "../src";

const adapter = new ActionItemAdapter();
const niels = { kind: "user", userId: "u-niels" } as const;
const ID = "conv-1:action-item:1:abc123abc123";
const at = (): Date => new Date("2026-10-15T08:02:00.000Z");

const metadata: ActionItemMetadata = {
  conversationId: "conv-1",
  interfaceType: "cli",
  channelId: "cli-terminal",
  capturedAt: "2026-01-01T00:01:00.000Z",
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
      { id: ID, from: "open", to: "blocked" },
    );

    expect(result.status).toBe("moved");
    const after = await stored(service);
    expect(after.metadata.status).toBe("blocked");
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
      { id: ID, from: "open", to: "done" },
    );

    const result = await moveActionItem(
      { entityService: service, now: at, visibilityScope: "restricted" },
      { id: ID, from: "open", to: "blocked" },
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
      { id: ID, from: "open", to: "doing" },
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
      { id: ID, from: "open", to: "doing" },
    );

    expect(result).toEqual({ status: "conflict", current: "open" });
    expect(writes).toBe(2);
  });

  it("reports a card that no longer exists", async () => {
    const service = await brain();
    const result = await moveActionItem(
      { entityService: service, now: at, visibilityScope: "restricted" },
      { id: "missing", from: "open", to: "doing" },
    );
    expect(result).toEqual({ status: "not-found" });
  });
});

describe("noting a stored card", () => {
  it("keeps the note and claims the card for the board", async () => {
    const service = await brain();

    const result = await addActionItemNote(
      { entityService: service, now: at, visibilityScope: "restricted" },
      {
        id: ID,
        text: "Venue wants a deposit.",
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
        { id: "missing", text: "Hello." },
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
      assignedTo: [{ name: "Alex Morgan" }],
      requestedBy: [{ name: "Niels Ward", id: "user:u-niels" }],
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

describe("creating a card on the board", () => {
  it("creates an open card that names who added it and comes from no conversation", async () => {
    const service = await brain();

    const result = await createBoardCard(
      { entityService: service, now: at, visibility: "shared" },
      {
        title: "Order name badges",
        text: "Two hundred, with the new logo.",
        assignee: "Alex Morgan",
        actor: niels,
        actorName: "Niels Ward",
      },
    );

    expect(result.status).toBe("created");
    expect(result.id).toMatch(/^board:/);
    const card = await service.getEntity(
      {
        entityType: "action-item",
        id: result.id,
        visibilityScope: "restricted",
      },
      actionItemSchema,
    );
    if (!card) throw new Error("The card was not stored");
    expect(card.visibility).toBe("shared");
    expect(card.metadata).toEqual({
      origin: "board",
      capturedAt: "2026-10-15T08:02:00.000Z",
      status: "open",
      assignedTo: [{ name: "Alex Morgan" }],
      requestedBy: [{ name: "Niels Ward", id: "user:u-niels" }],
    });
    expect(actionItemBody(card.content)).toContain(
      "# Action item: Order name badges",
    );
    expect(actionItemBody(card.content)).toContain(
      "Two hundred, with the new logo.",
    );
    expect(actionItemSource(card)).toEqual({ place: "Board" });
  });

  it("uses the title as the text when no details are given", async () => {
    const service = await brain();

    const { id } = await createBoardCard(
      { entityService: service, now: at, visibility: "shared" },
      { title: "Book the venue", text: "  ", actor: niels },
    );

    const card = await service.getEntity(
      { entityType: "action-item", id, visibilityScope: "restricted" },
      actionItemSchema,
    );
    if (!card) throw new Error("The card was not stored");
    expect(card.metadata).not.toHaveProperty("assignedTo");
    expect(actionItemBody(card.content)).toBe(
      "# Action item: Book the venue\n\nBook the venue\n",
    );
  });
});
