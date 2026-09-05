import type { IRuntimeStateStore, ServiceEntityService } from "@brains/plugins";
import { KeyedSerialQueue, SerialQueue } from "@brains/utils/serial-queue";
import { z } from "@brains/utils/zod";
import { mailItemAdapter } from "./entity/adapters/mail-item-adapter";
import {
  mailItemSchema,
  type MailItemEntity,
} from "./entity/schemas/mail-item";
import {
  withMailThreadOrdinal,
  type MailItemProjection,
} from "./lib/mail-item-projection";

const THREAD_ORDINAL_STATE_KEY = "state";
const DEFAULT_MIGRATION_PAGE_SIZE = 100;

type ThreadOrdinalStateSchema = z.ZodDiscriminatedUnion<
  [
    z.ZodObject<{ kind: z.ZodLiteral<"building"> }, z.core.$strict>,
    z.ZodObject<{ kind: z.ZodLiteral<"ready"> }, z.core.$strict>,
  ]
>;

export const threadOrdinalStateSchema: ThreadOrdinalStateSchema =
  z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("building") }),
    z.strictObject({ kind: z.literal("ready") }),
  ]);

export type ThreadOrdinalState = z.output<typeof threadOrdinalStateSchema>;

interface MailThreadOrdinalCoordinatorOptions {
  entityService: ServiceEntityService;
  state: IRuntimeStateStore<ThreadOrdinalState>;
  pageSize?: number | undefined;
}

type ProjectionWriter = (projection: MailItemProjection) => Promise<void>;

/** Coordinates migration and ingress over the indexed mail thread position. */
export class MailThreadOrdinalCoordinator {
  private readonly entityService: ServiceEntityService;
  private readonly state: IRuntimeStateStore<ThreadOrdinalState>;
  private readonly pageSize: number;
  private readonly ingressGate = new SharedExclusiveGate();
  private readonly threadQueues = new KeyedSerialQueue();
  private initialization: Promise<void> | undefined;

  constructor(options: MailThreadOrdinalCoordinatorOptions) {
    this.entityService = options.entityService;
    this.state = options.state;
    this.pageSize = z
      .number()
      .int()
      .min(1)
      .max(1_000)
      .parse(options.pageSize ?? DEFAULT_MIGRATION_PAGE_SIZE);
  }

  initialize(): Promise<void> {
    if (!this.initialization) {
      const attempt = this.initializeOnce();
      this.initialization = attempt.catch((error: unknown) => {
        this.initialization = undefined;
        throw error;
      });
    }
    return this.initialization;
  }

  async isReady(): Promise<boolean> {
    return (await this.state.get(THREAD_ORDINAL_STATE_KEY))?.kind === "ready";
  }

  async persist(
    projection: MailItemProjection,
    writer: ProjectionWriter,
  ): Promise<void> {
    await this.ingressGate.withShared(async () => {
      if (await this.exists(projection.id)) return;
      const threadKey = projection.metadata.threadKey;
      if (!threadKey || !(await this.isReady())) {
        await writer(projection);
        return;
      }

      await this.threadQueues.run(threadKey, async () => {
        if (await this.exists(projection.id)) return;
        const ordinal = await this.nextOrdinal(threadKey);
        await writer(withMailThreadOrdinal(projection, ordinal));
      });
    });
  }

  private async initializeOnce(): Promise<void> {
    if (await this.isReady()) return;
    await this.state.set(THREAD_ORDINAL_STATE_KEY, { kind: "building" });
    const initialCount = await this.entityService.countEntities({
      entityType: "mail-item",
      options: { filter: { visibilityScope: "restricted" } },
    });
    await this.reindex(initialCount);
    await this.ingressGate.withExclusive(async () => {
      const finalCount = await this.entityService.countEntities({
        entityType: "mail-item",
        options: { filter: { visibilityScope: "restricted" } },
      });
      await this.reindex(finalCount);
      await this.state.set(THREAD_ORDINAL_STATE_KEY, { kind: "ready" });
    });
  }

  private async reindex(total: number): Promise<void> {
    const nextByThread = new Map<string, number>();
    let offset = 0;
    while (offset < total) {
      const entities = await this.entityService.listEntities(
        {
          entityType: "mail-item",
          options: {
            limit: Math.min(this.pageSize, total - offset),
            offset,
            sortFields: [
              { field: "receivedAt", direction: "asc" },
              { field: "id", direction: "asc" },
            ],
            filter: { visibilityScope: "restricted" },
          },
        },
        mailItemSchema,
      );
      if (entities.length === 0) break;
      for (const rawEntity of entities) {
        const entity = mailItemSchema.parse(rawEntity);
        const { frontmatter } = mailItemAdapter.parseMailItemContent(
          entity.content,
        );
        const threadKey = frontmatter.source.threadKey;
        if (!threadKey) continue;
        const ordinal = (nextByThread.get(threadKey) ?? 0) + 1;
        nextByThread.set(threadKey, ordinal);
        await this.updateOrdinal(entity, ordinal);
      }
      offset += entities.length;
    }
  }

  private async updateOrdinal(
    entity: MailItemEntity,
    ordinal: number,
  ): Promise<void> {
    const parsed = mailItemAdapter.parseMailItemContent(entity.content);
    const threadKey = parsed.frontmatter.source.threadKey;
    if (!threadKey) return;
    if (
      parsed.frontmatter.source.threadOrdinal === ordinal &&
      entity.metadata.threadKey === threadKey &&
      entity.metadata.threadOrdinal === ordinal
    ) {
      return;
    }
    const content = mailItemAdapter.createMailItemContent(
      {
        ...parsed.frontmatter,
        source: { ...parsed.frontmatter.source, threadOrdinal: ordinal },
      },
      parsed.summary,
    );
    const metadata = mailItemAdapter.fromMarkdown(content).metadata;
    if (!metadata) throw new Error("Mail item metadata could not be derived");
    await this.entityService.updateEntity({
      entity: { ...entity, content, metadata },
    });
  }

  private async nextOrdinal(threadKey: string): Promise<number> {
    const [latest] = await this.entityService.listEntities(
      {
        entityType: "mail-item",
        options: {
          limit: 1,
          sortFields: [{ field: "threadOrdinal", direction: "desc" }],
          filter: {
            metadata: { threadKey },
            visibilityScope: "restricted",
          },
        },
      },
      mailItemSchema,
    );
    return (latest?.metadata.threadOrdinal ?? 0) + 1;
  }

  private async exists(id: string): Promise<boolean> {
    return (
      (await this.entityService.getEntity({
        entityType: "mail-item",
        id,
        visibilityScope: "restricted",
      })) !== null
    );
  }
}

class SharedExclusiveGate {
  private readonly exclusiveQueue = new SerialQueue();
  private activeShared = 0;
  private exclusive = false;
  private reopen: Promise<void> = Promise.resolve();
  private resolveReopen: (() => void) | undefined;
  private drain: Promise<void> | undefined;
  private resolveDrain: (() => void) | undefined;

  async withShared<T>(operation: () => Promise<T>): Promise<T> {
    while (this.exclusive) await this.reopen;
    this.activeShared += 1;
    try {
      return await operation();
    } finally {
      this.activeShared -= 1;
      if (this.activeShared === 0) this.resolveDrain?.();
    }
  }

  withExclusive<T>(operation: () => Promise<T>): Promise<T> {
    return this.exclusiveQueue.run(async () => {
      this.exclusive = true;
      this.reopen = new Promise<void>((resolve) => {
        this.resolveReopen = resolve;
      });
      if (this.activeShared > 0) {
        this.drain = new Promise<void>((resolve) => {
          this.resolveDrain = resolve;
        });
        await this.drain;
      }
      try {
        return await operation();
      } finally {
        this.exclusive = false;
        this.resolveDrain = undefined;
        this.drain = undefined;
        this.resolveReopen?.();
        this.resolveReopen = undefined;
      }
    });
  }
}
