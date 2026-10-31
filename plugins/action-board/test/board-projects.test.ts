import { afterEach, describe, expect, it } from "bun:test";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import {
  createMockShell,
  createServicePluginContext,
} from "@brains/plugins/test";
import type {
  StudioWorkspaceActor,
  StudioWorkspaceRegistration,
} from "@brains/plugins";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { generateMarkdown } from "@brains/utils/markdown-frontmatter";
import { z } from "@brains/utils/zod";
import {
  ActionItemAdapter,
  actionItemSchema,
  type ActionItemMetadata,
  type ActionItemStatus,
} from "@brains/action-items";
import { registerBoardWorkspace } from "../src/board-workspace";

const NOW = new Date("2026-10-15T12:00:00.000Z");

const niels: StudioWorkspaceActor = {
  interfaceType: "studio",
  userId: "u-niels",
  displayName: "Niels Ward",
  actor: { kind: "user", userId: "u-niels" },
  userPermissionLevel: "trusted",
  visibilityScope: "shared",
  isAnchor: false,
};

interface Card {
  id: string;
  text: string;
  status: ActionItemStatus;
  projects?: string[];
}

function metadataFor(status: ActionItemStatus): ActionItemMetadata {
  return {
    conversationId: "conv-1",
    channelId: "events",
    channelName: "events",
    interfaceType: "discord",
    capturedAt: "2026-10-10T10:20:00.000Z",
    status,
  };
}

function contentFor(card: Card, field = "projects"): string {
  return generateMarkdown(
    {
      ...metadataFor(card.status),
      ...(card.projects ? { [field]: card.projects } : {}),
    },
    `# Action item: ${card.text}\n\n${card.text}\n`,
  );
}

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

interface Brain {
  service: EntityService;
  registration: StudioWorkspaceRegistration;
}

/** A real entity database, so grouping memberships project and query as they do in a brain. */
async function brain(
  cards: Card[],
  options: { grouping?: string; defined?: boolean } = {},
): Promise<Brain> {
  const directory = await createTestDirectory();
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  const shell = createMockShell();
  const key = options.grouping ?? "projects";
  const dbConfig = { url: `file:${directory.dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const service = EntityService.createFresh({
    dbConfig,
    embeddingDbConfig: { url: `file:${directory.dir}/embeddings.db` },
    entityRegistry: registry,
    logger,
    jobQueueService: shell.getJobQueueService(),
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
  shell.getEntityService = (): EntityService => service;
  shell.getEntityRegistry = (): EntityRegistry => registry;
  registry.registerEntityType(
    "action-item",
    actionItemSchema,
    new ActionItemAdapter(),
  );
  if (options.defined !== false)
    registry.registerGrouping({
      key,
      field: key,
      label: "Projects",
      types: ["action-item"],
    });
  await service.initialize();
  close = async (): Promise<void> => {
    service.close();
    await directory.cleanup();
  };
  for (const card of cards) {
    await service.createEntity({
      entity: {
        id: card.id,
        entityType: "action-item",
        visibility: "shared",
        content: contentFor(card, key),
        metadata: metadataFor(card.status),
      },
    });
  }

  let registration: StudioWorkspaceRegistration | undefined;
  const boardContext = createServicePluginContext(shell, "action-board");
  boardContext.messaging.subscribe<
    StudioWorkspaceRegistration,
    { workspaceUrl: string }
  >("studio:register-workspace", async (message) => {
    registration = message.payload;
    return {
      success: true,
      data: { workspaceUrl: "/studio/workspaces/action-board%3Aboard" },
    };
  });
  await registerBoardWorkspace(boardContext, {
    now: () => NOW,
    visibility: "shared",
    projectGrouping: key,
  });
  if (!registration) throw new Error("Board was not registered");
  return { service, registration };
}

const blockSchema = z.looseObject({ type: z.string(), id: z.string() });

async function blocks(
  registration: StudioWorkspaceRegistration,
  query?: Record<string, string>,
): Promise<z.output<typeof blockSchema>[]> {
  const { view } = z
    .object({ view: z.object({ blocks: z.array(blockSchema) }) })
    .parse(await registration.dataProvider(niels, query));
  return view.blocks;
}

const matrixSchema = z.looseObject({
  master: z.looseObject({
    cells: z.array(
      z.looseObject({
        id: z.string(),
        items: z.array(z.looseObject({ title: z.string() })),
      }),
    ),
  }),
});

async function boardTitles(
  registration: StudioWorkspaceRegistration,
  query?: Record<string, string>,
): Promise<Record<string, string[]>> {
  const detail = (await blocks(registration, query)).find(
    (block) => block.id === "board-detail",
  );
  return Object.fromEntries(
    matrixSchema.parse(detail).master.cells.map((cell) => [
      cell.id,
      // Cards written in the same millisecond have no defined order.
      cell.items.map((item) => item.title).sort(),
    ]),
  );
}

const projectControlSchema = z.looseObject({
  type: z.literal("query"),
  controls: z.array(
    z.looseObject({
      key: z.string(),
      label: z.string(),
      value: z.string().optional(),
      allLabel: z.string().optional(),
      options: z.array(
        z.looseObject({ value: z.string(), count: z.number().optional() }),
      ),
    }),
  ),
});

const rollupSchema = z.looseObject({
  type: z.literal("card"),
  label: z.string(),
  blocks: z.array(z.looseObject({ type: z.string(), id: z.string() })),
});
const countsSchema = z.looseObject({
  type: z.literal("stats"),
  items: z.array(
    z.object({
      label: z.string(),
      value: z.number(),
      tone: z.string().optional(),
    }),
  ),
});
const blockedListSchema = z.looseObject({
  items: z.array(z.looseObject({ title: z.string() })),
});

const CARDS: Card[] = [
  { id: "a", text: "Draft the hub brief", status: "open", projects: ["Hub"] },
  { id: "b", text: "Find a venue", status: "open", projects: ["Hub"] },
  { id: "c", text: "Ask the city", status: "blocked", projects: ["Hub"] },
  { id: "d", text: "Pick a date", status: "done", projects: ["Hub", "Fair"] },
  { id: "e", text: "Print posters", status: "doing", projects: ["Fair"] },
  { id: "f", text: "Water the plants", status: "open" },
];

describe("projects on the Board", () => {
  it("offers each project as a filter, with how many cards it holds", async () => {
    const { registration } = await brain(CARDS);

    const control = projectControlSchema.parse(
      (await blocks(registration)).find(
        (block) => block.id === "board-projects",
      ),
    ).controls[0];

    expect(control?.key).toBe("project");
    expect(control?.allLabel).toBe("All projects");
    expect(control?.options.map(({ value, count }) => [value, count])).toEqual([
      ["Fair", 2],
      ["Hub", 4],
    ]);
  });

  it("filters the board to a project's members", async () => {
    const { registration } = await brain(CARDS);

    expect(await boardTitles(registration, { project: "Hub" })).toEqual({
      open: ["Draft the hub brief", "Find a venue"],
      doing: [],
      blocked: ["Ask the city"],
      done: ["Pick a date"],
    });
    const all = await boardTitles(registration);
    expect(all["open"]).toContain("Water the plants");
  });

  it("rolls a project up into counts per column and its blocked cards", async () => {
    const { registration } = await brain(CARDS);

    const rollup = rollupSchema.parse(
      (await blocks(registration, { project: "Hub" })).find(
        (block) => block.id === "project-rollup",
      ),
    );

    expect(rollup.label).toBe("Hub");
    const counts = countsSchema.parse(
      rollup.blocks.find((block) => block.id === "project-counts"),
    );
    expect(counts.items).toEqual([
      { label: "To do", value: 2 },
      { label: "Doing", value: 0 },
      { label: "Blocked", value: 1, tone: "warn" },
      { label: "Done", value: 1 },
    ]);
    const blocked = blockedListSchema.parse(
      rollup.blocks.find((block) => block.id === "project-blocked"),
    );
    expect(blocked.items.map((item) => item.title)).toEqual(["Ask the city"]);
  });

  it("keeps an item when its project is removed", async () => {
    const { service, registration } = await brain(CARDS);
    const stored = await service.getEntity({
      entityType: "action-item",
      id: "e",
      visibilityScope: "shared",
    });
    if (!stored) throw new Error("missing fixture");
    await service.updateEntity({
      entity: {
        ...stored,
        content: contentFor({
          id: "e",
          text: "Print posters",
          status: "doing",
          projects: [],
        }),
      },
    });

    expect(await boardTitles(registration, { project: "Fair" })).toEqual({
      open: [],
      doing: [],
      blocked: [],
      done: ["Pick a date"],
    });
    expect((await boardTitles(registration))["doing"]).toEqual([
      "Print posters",
    ]);
  });

  it("reads the grouping the brain configures", async () => {
    const { registration } = await brain(CARDS, { grouping: "initiatives" });

    const control = projectControlSchema.parse(
      (await blocks(registration)).find(
        (block) => block.id === "board-projects",
      ),
    ).controls[0];
    expect(control?.options.map(({ value }) => value)).toEqual(["Fair", "Hub"]);
    expect(await boardTitles(registration, { project: "Fair" })).toMatchObject({
      doing: ["Print posters"],
      done: ["Pick a date"],
    });
  });

  it("shows no project filter when the brain defines no project grouping", async () => {
    const { registration } = await brain(CARDS.slice(5), { defined: false });

    const ids = (await blocks(registration, { project: "Hub" })).map(
      (block) => block.id,
    );
    expect(ids).not.toContain("board-projects");
    expect(ids).not.toContain("project-rollup");
    expect(await boardTitles(registration, { project: "Hub" })).toEqual({
      open: ["Water the plants"],
      doing: [],
      blocked: [],
      done: [],
    });
  });
});
