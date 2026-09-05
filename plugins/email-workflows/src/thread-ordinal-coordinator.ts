import {
  z,
  type IRuntimeStateStore,
  type JobEntityAccess,
} from "@brains/sdk/entities";
import { KeyedSerialQueue, SerialQueue } from "@brains/utils/serial-queue";
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

/** Mail items as the coordinator reads and re-indexes them. */
export type MailThreadEntityAccess = Pick<
  JobEntityAccess,
  "listEntities" | "getEntity" | "update" | "count"
>;

interface MailThreadOrdinalCoordinatorOptions {
  state: IRuntimeStateStore<ThreadOrdinalState>;
  pageSize?: number | undefined;
}

type ProjectionWriter = (projection: MailItemProjection) => Promise<void>;

/**
 * Coordinates migration and ingress over the indexed mail thread position.
 *
 * Built once at setup with the state it keeps between processes; every call
 * is handed the entity access of the context it runs in, since the
 * migration runs at ready and ingress runs inside the triage job.
 */
export class MailThreadOrdinalCoordinator {
  private readonly state: IRuntimeStateStore<ThreadOrdinalState>;
  private readonly pageSize: number;
  private readonly ingressGate = new SharedExclusiveGate();
  private readonly threadQueues = new KeyedSerialQueue();
  private initialization: Promise<void> | undefined;

  constructor(options: MailThreadOrdinalCoordinatorOptions) {
    this.state = options.state;
    this.pageSize = z
      .number()
      .int()
      .min(1)
      .max(1_000)
      .parse(options.pageSize ?? DEFAULT_MIGRATION_PAGE_SIZE);
  }

  initialize(entities: MailThreadEntityAccess): Promise<void> {
    if (!this.initialization) {
      const attempt = this.initializeOnce(entities);
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
    entities: Pick<MailThreadEntityAccess, "listEntities" | "getEntity">,
  ): Promise<void> {
    await this.ingressGate.withShared(async () => {
      if (await this.exists(entities, projection.id)) return;
      const threadKey = projection.metadata.threadKey;
      if (!threadKey || !(await this.isReady())) {
        await writer(projection);
        return;
      }

      await this.threadQueues.run(threadKey, async () => {
        if (await this.exists(entities, projection.id)) return;
        const ordinal = await this.nextOrdinal(entities, threadKey);
        await writer(withMailThreadOrdinal(projection, ordinal));
      });
    });
  }

  private async initializeOnce(
    entities: MailThreadEntityAccess,
  ): Promise<void> {
    if (await this.isReady()) return;
    await this.state.set(THREAD_ORDINAL_STATE_KEY, { kind: "building" });
    const initialCount = await entities.count({
      entityType: "mail-item",
      options: { filter: { visibilityScope: "restricted" } },
    });
    await this.reindex(entities, initialCount);
    await this.ingressGate.withExclusive(async () => {
      const finalCount = await entities.count({
        entityType: "mail-item",
        options: { filter: { visibilityScope: "restricted" } },
      });
      await this.reindex(entities, finalCount);
      await this.state.set(THREAD_ORDINAL_STATE_KEY, { kind: "ready" });
    });
  }

  private async reindex(
    entities: MailThreadEntityAccess,
    total: number,
  ): Promise<void> {
    const nextByThread = new Map<string, number>();
    const page = async (offset: number): Promise<void> => {
      if (offset >= total) return;
      const items = await entities.listEntities(
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
      if (items.length === 0) return;
      for (const entity of items) {
        const { frontmatter } = mailItemAdapter.parseMailItemContent(
          entity.content,
        );
        const threadKey = frontmatter.source.threadKey;
        if (!threadKey) continue;
        const ordinal = (nextByThread.get(threadKey) ?? 0) + 1;
        nextByThread.set(threadKey, ordinal);
        await this.updateOrdinal(entities, entity, ordinal);
      }
      await page(offset + items.length);
    };
    await page(0);
  }

  private async updateOrdinal(
    entities: Pick<MailThreadEntityAccess, "update">,
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
    await entities.update({ ...entity, content, metadata });
  }

  private async nextOrdinal(
    entities: Pick<MailThreadEntityAccess, "listEntities">,
    threadKey: string,
  ): Promise<number> {
    const [latest] = await entities.listEntities(
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

  private async exists(
    entities: Pick<MailThreadEntityAccess, "getEntity">,
    id: string,
  ): Promise<boolean> {
    return (
      (await entities.getEntity({
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
