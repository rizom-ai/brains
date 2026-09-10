import type { SchemaReturn } from "../internal/schema-return";
import type { SdkErrorCode } from "@brains/contracts";
import type { z } from "@brains/utils/zod";
import type { EntityAccess } from "../entity/entity-access-contract";
import type { AnchorProfile, BrainCharacter } from "./identity";

export type SubscriptionPayloadSchema = z.ZodType<unknown, unknown>;

/**
 * A question and the shape of its answer, declared once.
 *
 * Both sides of a request already share the topic and the schemas; naming
 * them together is what lets the answerer bind a handler to it and the asker
 * read a parsed answer back, instead of each parsing an envelope by hand and
 * mapping every failure to the same shrug.
 *
 * Structural on purpose: the package that owns a question can declare one
 * without importing the authoring runtime, which is how the shared contracts
 * package holds the ones two packages both use.
 */
export interface RequestContract<
  TPayloadSchema extends SubscriptionPayloadSchema = SubscriptionPayloadSchema,
  TResponseSchema extends SubscriptionPayloadSchema = SubscriptionPayloadSchema,
> {
  readonly topic: string;
  readonly payload: TPayloadSchema;
  readonly response: TResponseSchema;
}

/** Asking over the bus: by topic for anything, by contract for an answer. */
export interface SubscriptionRequester {
  (message: {
    readonly type: string;
    readonly payload: unknown;
  }): Promise<unknown>;
  <
    TPayloadSchema extends SubscriptionPayloadSchema,
    TResponseSchema extends SubscriptionPayloadSchema,
  >(
    contract: RequestContract<TPayloadSchema, TResponseSchema>,
    payload: z.input<TPayloadSchema>,
  ): Promise<RequestResult<TResponseSchema>>;
}

/**
 * What an ask answers with: the parsed response, or why there is none.
 *
 * A refusal the answering package meant to give is a successful answer whose
 * data says so. This is the other kind: nobody listening, invalid input, a
 * handler failure, or an answer that did not match the declared response.
 */
export type RequestResult<TResponseSchema extends SubscriptionPayloadSchema> =
  | { readonly ok: true; readonly data: z.output<TResponseSchema> }
  | {
      readonly ok: false;
      readonly code: SdkErrorCode;
    };

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
  TResponseSchema extends SubscriptionPayloadSchema = SubscriptionPayloadSchema,
  TOutput extends SchemaReturn<z.input<TResponseSchema>> = SchemaReturn<
    z.input<TResponseSchema>
  >,
> {
  readonly topic: string;
  readonly payload: TPayloadSchema;
  /**
   * What this answers with, when it answers a request rather than reacting
   * to news. The runtime validates the handler's wire return through it;
   * typed askers parse that wire value at their boundary. Transformed values
   * are never fed back into the schema as though they were fresh inputs.
   */
  readonly response?: TResponseSchema | undefined;
  handle(context: {
    readonly payload: z.output<TPayloadSchema>;
    /**
     * Definition-typed reads and ownership-scoped writes, shared with tools
     * and jobs. Services may write their declared/stewarded types; interfaces
     * own none and every write is refused.
     */
    readonly entities: EntityAccess;
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
      /**
       * Ask, and read the answer. By topic for anything; by contract when the
       * answer has a declared shape, in which case it comes back parsed and
       * the ways it can fail are named.
       */
      readonly request: SubscriptionRequester;
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
  }): TOutput | Promise<TOutput>;
}

export type AnySubscriptionDefinition =
  SubscriptionDefinition<SubscriptionPayloadSchema>;
