import type { z } from "@brains/utils/zod";
import type {
  BaseEntity,
  ContentVisibility,
  ListOptions,
  EntitySchema,
} from "@brains/entity-service";
import type { AnchorProfile, BrainCharacter } from "./identity";

/**
 * The reads a subscription handler gets.
 *
 * Reads only: answering a request is not a licence to write, and an
 * interface — which declares no entity types — could not be given writes
 * anyway. A handler that must change something enqueues a job.
 */
export interface SubscriptionEntityReader {
  /**
   * One record, as the brain stores it.
   *
   * Narrowing takes the schema that narrows it. The shape used to come from
   * the caller alone — ask for a type and you were handed it, with nothing
   * checking the records matched — so a handler could name a field no entity
   * has, compile, and read `undefined` from it at runtime. This is the same
   * evidence jobs and data sources have always required.
   */
  getEntity(request: {
    entityType: string;
    id: string;
    visibilityScope?: ContentVisibility | undefined;
  }): Promise<BaseEntity | null>;
  getEntity<T extends BaseEntity>(
    request: {
      entityType: string;
      id: string;
      visibilityScope?: ContentVisibility | undefined;
    },
    schema: EntitySchema<T>,
  ): Promise<T | null>;
  /**
   * A page, narrowed by what the request asked for. The filter is the
   * store's own vocabulary, including how wide to read: a directory of
   * approved peers has to see the ones an operator saved as restricted.
   * Narrowed the same way as a single read. Named consumer: @brains/a2a.
   */
  listEntities(request: {
    entityType: string;
    options?: Pick<ListOptions, "limit" | "filter"> | undefined;
  }): Promise<BaseEntity[]>;
  listEntities<T extends BaseEntity>(
    request: {
      entityType: string;
      options?: Pick<ListOptions, "limit" | "filter"> | undefined;
    },
    schema: EntitySchema<T>,
  ): Promise<T[]>;
  /**
   * Which types exist, so a handler can answer "none" for a type nobody
   * registered instead of asking for it. Named consumer: @brains/a2a.
   */
  getEntityTypes(): string[];
}

export type SubscriptionPayloadSchema = z.ZodType<unknown, unknown>;

/**
 * A request a package answers on the message bus.
 *
 * Neither family owns this. An interface that delivered a message is the only
 * thing that can fetch it back, and a service that routes notifications is the
 * only thing that knows which transport to use — both are requests arriving on
 * a topic, not jobs, tools or checks.
 *
 * The payload schema is the boundary: the runtime validates before the handler
 * runs, so a malformed request is refused rather than reaching it.
 *
 * Named consumers: @brains/email, @brains/notifications.
 */
export interface SubscriptionDefinition<
  TPayloadSchema extends SubscriptionPayloadSchema = SubscriptionPayloadSchema,
> {
  readonly topic: string;
  readonly payload: TPayloadSchema;
  handle(context: {
    readonly payload: z.output<TPayloadSchema>;
    /**
     * Reads, because most requests are answered from the brain's own
     * records rather than from the payload alone. Named consumers:
     * @brains/site-info, @brains/newsletter.
     */
    readonly entities: SubscriptionEntityReader;
    /**
     * Who the brain is, for a request whose answer falls back to it — a
     * site with no title of its own is titled after its anchor.
     * Named consumer: @brains/site-info.
     */
    readonly identity: {
      get(): BrainCharacter;
      getProfile(): AnchorProfile;
    };
    /**
     * Publishing, for a subscription that announces rather than answers.
     * A bare "this entity changed" is not what anyone downstream needs;
     * turning it into what the change now means is a package's own job.
     * Named consumer: @brains/site-info.
     */
    readonly messaging: {
      send(message: {
        readonly type: string;
        readonly payload: unknown;
      }): Promise<unknown>;
      /**
       * Announce to everyone listening, for a handler whose answer is also
       * news — a discovered peer, a failed publish. Named consumer:
       * @brains/atproto.
       */
      publish(message: {
        readonly topic: string;
        readonly data: object;
      }): Promise<void>;
    };
    /**
     * Which plugin sent this.
     *
     * For a subscription that keeps a registry rather than answering a
     * question: two packages claiming the same lifecycle starter is a
     * conflict, and saying which one holds it needs a name.
     * Named consumer: @brains/playbooks.
     */
    readonly source: string;
  }): unknown | Promise<unknown>;
}

export type AnySubscriptionDefinition =
  SubscriptionDefinition<SubscriptionPayloadSchema>;
