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
  createActionItem,
  moveActionItem,
  reviseActionItem,
  trackInboxItem,
  withdrawActionItem,
} from "../src";
import {
  actionItemSchema,
  type ActionItemEntity,
  type ActionItemMetadata,
} from "../src";

const adapter = new ActionItemAdapter();
const niels = { kind: "user", userId: "u-niels" } as const;
const ID = "conv-1-action-item-1-abc123abc123";
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
      identity: { model: "test:mock", dimensions: 1536, promptRevision: 0 },
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
      // The projector stores the body hash in metadata as in the content.
      metadata: { ...metadata, projectedBodyHash: projectedBodyHash() },
    },
  });
  return service;
}

const PROJECTED_TITLE = "Action item: Book the venue";
const PROJECTED_TEXT = "Book the venue for the spring gathering.";

function projectedBodyHash(): string {
  return actionItemBodyHash(
    adapter.composeContent(PROJECTED_TITLE, PROJECTED_TEXT, metadata),
  );
}

function projectedContent(): string {
  return adapter.composeContent(PROJECTED_TITLE, PROJECTED_TEXT, {
    ...metadata,
    projectedBodyHash: projectedBodyHash(),
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

describe("withdrawing a found card", () => {
  it("deletes a card only its finder wrote", async () => {
    const service = await brain();

    const result = await withdrawActionItem(
      { entityService: service, visibilityScope: "restricted" },
      ID,
    );

    expect(result).toEqual({ status: "removed" });
    expect(
      await service.getEntity({
        entityType: "action-item",
        id: ID,
        visibilityScope: "restricted",
      }),
    ).toBeNull();
  });

  it("keeps a card the board has changed", async () => {
    const service = await brain();
    await group(service, "Spring gathering");

    const result = await withdrawActionItem(
      { entityService: service, visibilityScope: "restricted" },
      ID,
    );

    expect(result).toEqual({ status: "kept" });
    expect(isBoardOwned(await stored(service))).toBe(true);
  });

  it("keeps a card the board changes between read and delete", async () => {
    const service = await brain();
    let interleaved = false;
    const racing = {
      getEntity: service.getEntity.bind(service),
      deleteEntity: async (
        ...args: Parameters<EntityService["deleteEntity"]>
      ): Promise<boolean> => {
        if (!interleaved) {
          interleaved = true;
          await group(service, "Spring gathering");
        }
        return service.deleteEntity(...args);
      },
    };

    const result = await withdrawActionItem(
      { entityService: racing, visibilityScope: "restricted" },
      ID,
    );

    expect(result).toEqual({ status: "kept" });
    expect(await stored(service)).toBeDefined();
  });

  it("reports a card that no longer exists", async () => {
    const service = await brain();
    const result = await withdrawActionItem(
      { entityService: service, visibilityScope: "restricted" },
      "missing",
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
    assignee: { name: "Alex Morgan", id: "user:u-alex" },
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
      id: "inbox-contact-requests-req-1",
    });
    const card = await service.getEntity(
      {
        entityType: "action-item",
        id: "inbox-contact-requests-req-1",
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
      assignedTo: [{ name: "Alex Morgan", id: "user:u-alex" }],
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
      id: "inbox-contact-requests-req-1",
    });
  });

  it("keeps the card's id flat when the Inbox item's own id has colons", async () => {
    const service = await brain();

    const result = await trackInboxItem(
      { entityService: service, now: at, visibility: "shared" },
      {
        ...request,
        sourceRef: {
          sourceId: "mail",
          entityType: "mail-item",
          entityId: "imap:inbox:42",
        },
      },
    );

    expect(result).toEqual({
      status: "tracked",
      id: "inbox-mail-imap-inbox-42",
    });
  });
});

describe("creating a card someone asked for in a conversation", () => {
  it("creates an open card that names who asked and the conversation it came from", async () => {
    const service = await brain();

    const result = await createActionItem(
      { entityService: service, now: at, visibility: "shared" },
      {
        title: "Work on the innovation hub plan",
        text: "Yeehaa is working on the innovation hub plan.",
        assignee: { name: "Yeehaa", id: "user:u-yeehaa" },
        actor: niels,
        actorName: "Niels Ward",
        origin: {
          kind: "conversation",
          conversationId: "discord:1466324999475429386",
          interfaceType: "discord",
          channelId: "1466324999475429386",
          channelName: "executive-room",
        },
      },
    );

    expect(result.id).toMatch(/^work-on-the-innovation-hub-plan-[0-9a-z]{6}$/);
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
      origin: "conversation",
      conversationId: "discord:1466324999475429386",
      interfaceType: "discord",
      channelId: "1466324999475429386",
      channelName: "executive-room",
      capturedAt: "2026-10-15T08:02:00.000Z",
      status: "open",
      assignedTo: [{ name: "Yeehaa", id: "user:u-yeehaa" }],
      requestedBy: [{ name: "Niels Ward", id: "user:u-niels" }],
    });
    expect(actionItemSource(card)).toMatchObject({ place: "#executive-room" });
  });
});

describe("creating a card the channel pickup found", () => {
  const found = {
    id: "discord-1466-message-12-1",
    title: "Send the INC proposal",
    text: "Jo will send the INC proposal on Friday.",
    actor: { kind: "user", userId: "u-jo" } as const,
    actorName: "Jo",
    origin: {
      kind: "conversation",
      conversationId: "discord:1466",
      interfaceType: "discord",
      channelId: "1466",
      channelName: "executive-room",
    } as const,
    projected: true,
  };

  it("stores it under the id it was found by, marked as the pickup's own", async () => {
    const service = await brain();

    const result = await createActionItem(
      { entityService: service, now: at, visibility: "shared" },
      found,
    );

    expect(result).toEqual({ status: "created", id: found.id });
    const card = await service.getEntity(
      {
        entityType: "action-item",
        id: found.id,
        visibilityScope: "restricted",
      },
      actionItemSchema,
    );
    if (!card) throw new Error("The card was not stored");
    expect(card.metadata.projectedBodyHash).toBe(
      actionItemBodyHash(card.content),
    );
    expect(isBoardOwned(card)).toBe(false);
  });

  it("finds it already there when the same message is processed again", async () => {
    const service = await brain();
    const deps = {
      entityService: service,
      now: at,
      visibility: "shared" as const,
    };
    await createActionItem(deps, found);

    expect(await createActionItem(deps, found)).toEqual({
      status: "exists",
      id: found.id,
    });
  });

  it("keeps the due date the messages named, as the finder's", async () => {
    const service = await brain();
    await createActionItem(
      { entityService: service, now: at, visibility: "shared" },
      { ...found, dueDate: "2026-10-30" },
    );

    const card = await foundCard(service);
    expect(card.metadata.dueDate).toBe("2026-10-30");
    expect(isBoardOwned(card)).toBe(false);
  });

  it("gives the card to the board once someone else changes its due date", async () => {
    const service = await brain();
    await createActionItem(
      { entityService: service, now: at, visibility: "shared" },
      { ...found, dueDate: "2026-10-30" },
    );
    const card = await foundCard(service);

    await service.updateEntity({
      entity: {
        ...card,
        metadata: { ...card.metadata, dueDate: "2026-11-06" },
      },
    });

    expect(isBoardOwned(await foundCard(service))).toBe(true);
  });

  it("gives the card to the board once someone else changes its owner", async () => {
    const service = await brain();
    await createActionItem(
      { entityService: service, now: at, visibility: "shared" },
      { ...found, assignee: { name: "Jo", id: "user:u-jo" } },
    );
    const card = await foundCard(service);
    expect(isBoardOwned(card)).toBe(false);

    await service.updateEntity({
      entity: {
        ...card,
        metadata: {
          ...card.metadata,
          assignedTo: [{ name: "Sam", id: "user:u-sam" }],
        },
      },
    });

    expect(isBoardOwned(await foundCard(service))).toBe(true);
  });
});

async function foundCard(service: EntityService): Promise<ActionItemEntity> {
  const card = await service.getEntity(
    {
      entityType: "action-item",
      id: "discord-1466-message-12-1",
      visibilityScope: "restricted",
    },
    actionItemSchema,
  );
  if (!card) throw new Error("The found card was not stored");
  return card;
}

describe("revising a found card", () => {
  const found = {
    id: "discord-1466-message-12-1",
    title: "Send the INC proposal",
    text: "Jo will send the INC proposal on Friday.",
    assignee: { name: "Jo", id: "user:u-jo" },
    actor: { kind: "user", userId: "u-jo" } as const,
    actorName: "Jo",
    origin: {
      kind: "conversation",
      conversationId: "discord:1466",
      interfaceType: "discord",
      channelId: "1466",
    } as const,
    projected: true,
  };

  async function withFoundCard(): Promise<EntityService> {
    const service = await brain();
    await createActionItem(
      { entityService: service, now: at, visibility: "shared" },
      found,
    );
    return service;
  }

  it("rewrites its title, text and owner, and keeps it the finder's", async () => {
    const service = await withFoundCard();

    const result = await reviseActionItem(
      { entityService: service, visibilityScope: "restricted" },
      {
        id: found.id,
        title: "Send the INC proposal",
        text: "Sam will send the INC proposal on Monday.",
        assignee: { name: "Sam", id: "user:u-sam" },
        dueDate: undefined,
      },
    );

    expect(result).toEqual({ status: "revised" });
    const card = await foundCard(service);
    expect(actionItemBody(card.content)).toContain(
      "Sam will send the INC proposal on Monday.",
    );
    expect(card.metadata.assignedTo).toEqual([
      { name: "Sam", id: "user:u-sam" },
    ]);
    expect(card.metadata.requestedBy).toEqual([
      { name: "Jo", id: "user:u-jo" },
    ]);
    expect(isBoardOwned(card)).toBe(false);
  });

  it("sets, moves and clears a found card's due date", async () => {
    const service = await withFoundCard();
    const revise = (
      dueDate: string | undefined,
    ): ReturnType<typeof reviseActionItem> =>
      reviseActionItem(
        { entityService: service, visibilityScope: "restricted" },
        {
          id: found.id,
          title: found.title,
          text: found.text,
          assignee: found.assignee,
          dueDate,
        },
      );

    expect(await revise("2026-10-30")).toEqual({ status: "revised" });
    expect((await foundCard(service)).metadata.dueDate).toBe("2026-10-30");
    expect(await revise("2026-11-02")).toEqual({ status: "revised" });
    expect((await foundCard(service)).metadata.dueDate).toBe("2026-11-02");
    expect(await revise(undefined)).toEqual({ status: "revised" });
    const cleared = await foundCard(service);
    expect(cleared.metadata.dueDate).toBeUndefined();
    expect(isBoardOwned(cleared)).toBe(false);
  });

  it("leaves a card unchanged when the revision says what it already says", async () => {
    const service = await withFoundCard();

    const result = await reviseActionItem(
      { entityService: service, visibilityScope: "restricted" },
      {
        id: found.id,
        title: found.title,
        text: found.text,
        assignee: found.assignee,
        dueDate: undefined,
      },
    );

    expect(result).toEqual({ status: "unchanged" });
  });

  it("keeps a card the board has moved", async () => {
    const service = await withFoundCard();
    await moveActionItem(
      { entityService: service, now: at, visibilityScope: "restricted" },
      { id: found.id, from: "open", to: "doing" },
    );

    const result = await reviseActionItem(
      { entityService: service, visibilityScope: "restricted" },
      {
        id: found.id,
        title: found.title,
        text: "Changed.",
        assignee: undefined,
        dueDate: undefined,
      },
    );

    expect(result).toEqual({ status: "kept" });
    expect(actionItemBody((await foundCard(service)).content)).toContain(
      found.text,
    );
  });

  it("keeps a card the board changes between read and write", async () => {
    const service = await withFoundCard();
    let interleaved = false;
    const racing = {
      getEntity: service.getEntity.bind(service),
      updateEntity: async (
        ...args: Parameters<EntityService["updateEntity"]>
      ): Promise<EntityMutationResult> => {
        if (!interleaved) {
          interleaved = true;
          await moveActionItem(
            { entityService: service, now: at, visibilityScope: "restricted" },
            { id: found.id, from: "open", to: "doing" },
          );
        }
        return service.updateEntity(...args);
      },
    };

    const result = await reviseActionItem(
      { entityService: racing, visibilityScope: "restricted" },
      {
        id: found.id,
        title: found.title,
        text: "Changed.",
        assignee: undefined,
        dueDate: undefined,
      },
    );

    expect(result).toEqual({ status: "kept" });
    expect((await foundCard(service)).metadata.status).toBe("doing");
  });

  it("reports a card that no longer exists", async () => {
    const service = await brain();

    const result = await reviseActionItem(
      { entityService: service, visibilityScope: "restricted" },
      {
        id: "missing",
        title: "x",
        text: "x",
        assignee: undefined,
        dueDate: undefined,
      },
    );

    expect(result).toEqual({ status: "not-found" });
  });
});

describe("creating a card on the board", () => {
  it("creates an open card that names who added it and comes from no conversation", async () => {
    const service = await brain();

    const result = await createActionItem(
      { entityService: service, now: at, visibility: "shared" },
      {
        title: "Order name badges",
        text: "Two hundred, with the new logo.",
        assignee: { name: "Alex Morgan", id: "user:u-alex" },
        actor: niels,
        actorName: "Niels Ward",
        origin: { kind: "board" },
      },
    );

    expect(result.status).toBe("created");
    // Named after its title, with a short suffix: one flat file per card.
    expect(result.id).toMatch(/^order-name-badges-[0-9a-z]{6}$/);
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
      assignedTo: [{ name: "Alex Morgan", id: "user:u-alex" }],
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

    const { id } = await createActionItem(
      { entityService: service, now: at, visibility: "shared" },
      {
        title: "Book the venue",
        text: "  ",
        actor: niels,
        origin: { kind: "board" },
      },
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

describe("the card an Inbox item and the board both write", () => {
  /** The real service, recording what each writer hands it. */
  type CreateInput = Parameters<EntityService["createEntity"]>[0];

  function recording(service: EntityService): {
    entityService: Pick<EntityService, "getEntity" | "createEntity">;
    created: CreateInput[];
  } {
    const created: CreateInput[] = [];
    return {
      created,
      entityService: {
        getEntity: service.getEntity.bind(service),
        createEntity: (input): Promise<EntityMutationResult> => {
          created.push(input);
          return service.createEntity(input);
        },
      },
    };
  }

  it("collapses and truncates an Inbox title and names an unnamed tracker by id", async () => {
    const { entityService, created } = recording(await brain());

    await trackInboxItem(
      { entityService, now: at, visibility: "shared" },
      {
        sourceRef: {
          sourceId: "mail",
          entityType: "mail-item",
          entityId: "m-1",
        },
        title:
          "  Reply\n about   the\tnotes from the spring field trip, the venue walk-through and the tasting ",
        text: "  Grace asks for the notes.  ",
        actor: niels,
      },
    );

    expect(created).toEqual([
      {
        entity: {
          id: "inbox-mail-m-1",
          entityType: "action-item",
          visibility: "shared",
          content:
            "---\norigin: inbox\nsourceRef:\n  sourceId: mail\n  entityType: mail-item\n  entityId: m-1\ncapturedAt: '2026-10-15T08:02:00.000Z'\nstatus: open\nrequestedBy:\n  - id: 'user:u-niels'\n---\n# Action item: Reply about the notes from the spring field trip, the venue walk-through and...\n\nGrace asks for the notes.\n",
          metadata: {
            origin: "inbox",
            sourceRef: {
              sourceId: "mail",
              entityType: "mail-item",
              entityId: "m-1",
            },
            capturedAt: "2026-10-15T08:02:00.000Z",
            status: "open",
            requestedBy: [{ id: "user:u-niels" }],
          },
        },
        options: { eventContext: { actor: niels } },
      },
    ]);
  });

  it("writes a board card in the same shape, without a source", async () => {
    const { entityService, created } = recording(await brain());

    const { id } = await createActionItem(
      { entityService, now: at, visibility: "shared" },
      {
        title: "  Book\n the   venue ",
        text: "",
        assignee: { name: "Alex Morgan", id: "user:u-alex" },
        actor: niels,
        actorName: "Niels Ward",
        origin: { kind: "board" },
      },
    );

    expect(id).toMatch(/^book-the-venue-[0-9a-z]{6}$/);
    expect(created).toEqual([
      {
        entity: {
          id,
          entityType: "action-item",
          visibility: "shared",
          content:
            "---\norigin: board\ncapturedAt: '2026-10-15T08:02:00.000Z'\nstatus: open\nassignedTo:\n  - name: Alex Morgan\n    id: 'user:u-alex'\nrequestedBy:\n  - name: Niels Ward\n    id: 'user:u-niels'\n---\n# Action item: Book the venue\n\nBook the venue\n",
          metadata: {
            origin: "board",
            capturedAt: "2026-10-15T08:02:00.000Z",
            status: "open",
            assignedTo: [{ name: "Alex Morgan", id: "user:u-alex" }],
            requestedBy: [{ name: "Niels Ward", id: "user:u-niels" }],
          },
        },
        options: { eventContext: { actor: niels } },
      },
    ]);
  });
});
