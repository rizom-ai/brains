import { describe, expect, it } from "bun:test";
import type { InboundEmail } from "@brains/contracts";
import type { BaseEntity, IRuntimeStateStore } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";

import {
  MailItemPlugin,
  MailThreadOrdinalCoordinator,
  createMailItemProjection,
  mailItemAdapter,
  mailItemSchema,
  threadOrdinalStateSchema,
  type MailItemEntity,
  type MailItemProjection,
  type ThreadOrdinalState,
} from "../src";

class MemoryStateStore<T> implements IRuntimeStateStore<T> {
  readonly values = new Map<string, T>();

  async get(key: string): Promise<T | null> {
    return this.values.get(key) ?? null;
  }

  async has(key: string): Promise<boolean> {
    return this.values.has(key);
  }

  async set(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }

  async setIfNotExists(key: string, value: T): Promise<boolean> {
    if (this.values.has(key)) return false;
    this.values.set(key, value);
    return true;
  }

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }

  async list(): Promise<
    Array<{ key: string; value: T; createdAt: Date; updatedAt: Date }>
  > {
    return [...this.values].map(([key, value]) => ({
      key,
      value,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    }));
  }

  async clear(): Promise<number> {
    const size = this.values.size;
    this.values.clear();
    return size;
  }
}

const classification = {
  decision: "retain" as const,
  title: "Threaded message",
  category: "work" as const,
  priority: "normal" as const,
  needsReply: true,
  requestedActions: ["Review"],
  summary: "A content-safe threaded message summary.",
};

function projection(
  id: string,
  receivedAt: string,
  threadId = "private-thread",
): MailItemProjection {
  const email: InboundEmail = {
    messageId: `<${id}@mail.test>`,
    sourceRef: `imap:${id}`,
    threadId,
    from: { address: "sender@example.com" },
    to: [{ address: "operator@example.net" }],
    subject: `Private ${id}`,
    receivedAt,
    text: `Private body ${id}`,
    headers: {},
  };
  return createMailItemProjection(email, classification);
}

async function persist(
  harness: ReturnType<typeof createPluginHarness>,
  item: MailItemProjection,
  options: { legacy?: boolean } = {},
): Promise<void> {
  const receivedAt = item.metadata.receivedAt;
  const {
    threadKey: _threadKey,
    threadOrdinal: _threadOrdinal,
    ...legacy
  } = item.metadata;
  await harness.getEntityService().createEntity({
    entity: {
      ...item,
      metadata: options.legacy ? legacy : item.metadata,
      created: receivedAt,
      updated: receivedAt,
    },
  });
}

async function threadedItems(
  harness: ReturnType<typeof createPluginHarness>,
): Promise<MailItemEntity[]> {
  const items = await harness.getEntityService().listEntities<MailItemEntity>({
    entityType: "mail-item",
    options: {
      limit: 100,
      sortFields: [
        { field: "receivedAt", direction: "asc" },
        { field: "id", direction: "asc" },
      ],
      filter: { visibilityScope: "restricted" },
    },
  });
  return items.map((item) => mailItemSchema.parse(item));
}

function ordinals(items: MailItemEntity[]): Array<number | undefined> {
  return items.map(
    (item) =>
      mailItemAdapter.parseMailItemContent(item.content).frontmatter.source
        .threadOrdinal,
  );
}

async function setup(): Promise<{
  harness: ReturnType<typeof createPluginHarness>;
  state: MemoryStateStore<ThreadOrdinalState>;
  coordinator: MailThreadOrdinalCoordinator;
}> {
  const harness = createPluginHarness();
  await harness.installPlugin(new MailItemPlugin());
  const entityService = harness.getEntityService();
  const listEntities = entityService.listEntities.bind(entityService);
  entityService.listEntities = async <T extends BaseEntity>(
    request: Parameters<typeof listEntities>[0],
  ): Promise<T[]> => {
    if (request.options?.sortFields?.[0]?.field !== "threadOrdinal") {
      return listEntities<T>(request);
    }
    const { sortFields: _sortFields, ...options } = request.options;
    const items = await listEntities<MailItemEntity>({
      ...request,
      options: {
        ...options,
        limit: 1_000,
        offset: 0,
      },
    });
    return items
      .sort(
        (left, right) =>
          (right.metadata.threadOrdinal ?? 0) -
          (left.metadata.threadOrdinal ?? 0),
      )
      .slice(0, request.options.limit) as T[];
  };
  entityService.countEntities = async (request): Promise<number> =>
    (
      await entityService.listEntities({
        entityType: request.entityType,
        ...(request.options ? { options: request.options } : {}),
      })
    ).length;
  const state = new MemoryStateStore<ThreadOrdinalState>();
  const coordinator = new MailThreadOrdinalCoordinator({
    entityService,
    state,
    pageSize: 1,
  });
  return { harness, state, coordinator };
}

describe("MailThreadOrdinalCoordinator", () => {
  it("restarts an interrupted paged migration without exposing partial ordinals", async () => {
    const { harness, state, coordinator } = await setup();
    await persist(harness, projection("first", "2026-08-11T08:00:00.000Z"), {
      legacy: true,
    });
    await persist(harness, projection("second", "2026-08-11T09:00:00.000Z"), {
      legacy: true,
    });
    await persist(harness, projection("third", "2026-08-11T10:00:00.000Z"), {
      legacy: true,
    });
    const entityService = harness.getEntityService();
    const updateEntity = entityService.updateEntity.bind(entityService);
    let updateCount = 0;
    entityService.updateEntity = async (
      request,
    ): ReturnType<typeof updateEntity> => {
      updateCount += 1;
      if (updateCount === 2) throw new Error("migration interrupted");
      return updateEntity(request);
    };

    const migrationError = await coordinator
      .initialize()
      .catch((error: unknown) => error);
    expect(migrationError).toEqual(new Error("migration interrupted"));
    expect(threadOrdinalStateSchema.parse(await state.get("state"))).toEqual({
      kind: "building",
    });
    expect(await coordinator.isReady()).toBe(false);

    entityService.updateEntity = updateEntity;
    const restarted = new MailThreadOrdinalCoordinator({
      entityService,
      state,
      pageSize: 1,
    });
    await restarted.initialize();

    expect(await restarted.isReady()).toBe(true);
    const migrated = await threadedItems(harness);
    expect(ordinals(migrated)).toEqual([1, 2, 3]);
    expect(migrated.map((item) => item.metadata.threadOrdinal)).toEqual([
      1, 2, 3,
    ]);
    expect(
      migrated.every((item) => item.metadata.threadKey?.length === 64),
    ).toBe(true);
    let readyUpdates = 0;
    entityService.updateEntity = async (
      request,
    ): ReturnType<typeof updateEntity> => {
      readyUpdates += 1;
      return updateEntity(request);
    };
    const alreadyReady = new MailThreadOrdinalCoordinator({
      entityService,
      state,
      pageSize: 1,
    });
    await alreadyReady.initialize();
    expect(readyUpdates).toBe(0);
  });

  it("catches up arrivals under an exclusive readiness transition", async () => {
    const { harness, coordinator } = await setup();
    await persist(harness, projection("first", "2026-08-11T08:00:00.000Z"), {
      legacy: true,
    });
    await persist(harness, projection("third", "2026-08-11T10:00:00.000Z"), {
      legacy: true,
    });
    const entityService = harness.getEntityService();
    const updateEntity = entityService.updateEntity.bind(entityService);
    let releaseInitial: (() => void) | undefined;
    let markInitialStarted: (() => void) | undefined;
    const initialStarted = new Promise<void>((resolve) => {
      markInitialStarted = resolve;
    });
    const initialBlocked = new Promise<void>((resolve) => {
      releaseInitial = resolve;
    });
    let releaseCatchUp: (() => void) | undefined;
    let markCatchUpStarted: (() => void) | undefined;
    const catchUpStarted = new Promise<void>((resolve) => {
      markCatchUpStarted = resolve;
    });
    const catchUpBlocked = new Promise<void>((resolve) => {
      releaseCatchUp = resolve;
    });
    let firstUpdate = true;
    const middle = projection("second", "2026-08-11T11:00:00.000Z");
    entityService.updateEntity = async (
      request,
    ): ReturnType<typeof updateEntity> => {
      if (firstUpdate) {
        firstUpdate = false;
        markInitialStarted?.();
        await initialBlocked;
      }
      if (
        request.entity.id === middle.id &&
        mailItemAdapter.parseMailItemContent(request.entity.content).frontmatter
          .source.threadOrdinal !== undefined
      ) {
        markCatchUpStarted?.();
        await catchUpBlocked;
      }
      return updateEntity(request);
    };

    const migration = coordinator.initialize();
    await initialStarted;
    let middleAtIngress: MailItemProjection | undefined;
    await coordinator.persist(middle, async (item) => {
      middleAtIngress = item;
      await persist(harness, item);
    });
    expect(
      middleAtIngress &&
        mailItemAdapter.parseMailItemContent(middleAtIngress.content)
          .frontmatter.source.threadOrdinal,
    ).toBeUndefined();
    releaseInitial?.();
    await catchUpStarted;

    let readyIngressPersisted = false;
    const fourth = projection("fourth", "2026-08-11T12:00:00.000Z");
    const readyIngress = coordinator.persist(fourth, async (item) => {
      readyIngressPersisted = true;
      await persist(harness, item);
    });
    await Promise.resolve();
    expect(readyIngressPersisted).toBe(false);

    releaseCatchUp?.();
    await Promise.all([migration, readyIngress]);

    expect(await coordinator.isReady()).toBe(true);
    expect(ordinals(await threadedItems(harness))).toEqual([1, 2, 3, 4]);
  });

  it("serializes concurrent arrivals and makes a replay ordinal-neutral", async () => {
    const { harness, coordinator } = await setup();
    await coordinator.initialize();
    const first = projection("first", "2026-08-11T08:00:00.000Z");
    const second = projection("second", "2026-08-11T08:00:00.000Z");

    await Promise.all([
      coordinator.persist(first, (item) => persist(harness, item)),
      coordinator.persist(second, (item) => persist(harness, item)),
    ]);
    let replayWrites = 0;
    await coordinator.persist(first, async () => {
      replayWrites += 1;
    });

    const items = await threadedItems(harness);
    expect(items).toHaveLength(2);
    expect(new Set(ordinals(items))).toEqual(new Set([1, 2]));
    expect(replayWrites).toBe(0);
  });
});
