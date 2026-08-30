import { z } from "@brains/utils/zod";
import type { EntityService } from "./types";

/**
 * Token minted by `DurableBulkMutationBatch.childRef` and embedded in child
 * job data. Self-contained: the worker-side calls rehydrate `source` (bound
 * to the plugin) and `operationId` (always the root job id) from context, so
 * neither leaks into job payloads.
 */
export interface DurableBulkMutationChildRef {
  rootJobId: string;
  childKey: string;
  expectedChildren: number;
}

export const durableBulkMutationChildRefSchema: z.ZodType<
  DurableBulkMutationChildRef,
  DurableBulkMutationChildRef
> = z.object({
  rootJobId: z.string().min(1),
  childKey: z.string().min(1),
  expectedChildren: z.number().int().positive(),
});

/**
 * Handle returned by `beginDurableBulkMutation`. The durable root marker
 * already exists when the handle is issued, so children enqueued with its
 * refs are recoverable from the first moment they can run.
 */
export interface DurableBulkMutationBatch {
  readonly rootJobId: string;
  /** Mint the token a child job carries in its data. Pure. */
  childRef(childKey: string): DurableBulkMutationChildRef;
  /** Record enqueue success. Call after the batch enqueue resolves. */
  seal(): Promise<void>;
  /** Record enqueue failure. Call when the batch enqueue throws. */
  abort(): Promise<void>;
}

/**
 * Durable bulk-mutation coordination granted to service plugins as
 * `context.entityCoordination`. The plugin id is bound as the mutation
 * source at context creation, and child calls are keyed by ref tokens, so
 * plugins never handle `source` or `operationId`.
 */
export interface EntityBulkCoordination {
  beginDurableBulkMutation(input: {
    rootJobId: string;
    expectedChildren: number;
  }): Promise<DurableBulkMutationBatch>;
  /** Run a child mutation under its batch's projection scope. */
  runDurableBulkMutationChild<TResult>(
    ref: DurableBulkMutationChildRef,
    jobId: string,
    mutation: () => Promise<TResult>,
  ): Promise<TResult>;
  /**
   * Record a child's terminal outcome. Driven by the job queue's terminal
   * lifecycle (after retries), which is why it is not folded into
   * `runDurableBulkMutationChild`: a throwing mutation may still be retried.
   */
  settleDurableBulkMutationChild(
    ref: DurableBulkMutationChildRef,
    jobId: string,
    outcome: "completed" | "failed",
  ): Promise<void>;
}

type EntityBulkCoordinationBackend = Pick<
  EntityService,
  | "prepareDurableBulkMutation"
  | "finalizeDurableBulkMutationEnqueue"
  | "failDurableBulkMutationEnqueue"
  | "runDurableBulkMutationChild"
  | "settleDurableBulkMutationChild"
>;

export function createEntityBulkCoordination(
  backend: EntityBulkCoordinationBackend,
  source: string,
): EntityBulkCoordination {
  return {
    async beginDurableBulkMutation({
      rootJobId,
      expectedChildren,
    }): Promise<DurableBulkMutationBatch> {
      await backend.prepareDurableBulkMutation({
        source,
        operationId: rootJobId,
        rootJobId,
        expectedChildren,
      });
      return {
        rootJobId,
        childRef: (childKey) => ({
          rootJobId,
          childKey,
          expectedChildren,
        }),
        seal: () => backend.finalizeDurableBulkMutationEnqueue(rootJobId),
        abort: () => backend.failDurableBulkMutationEnqueue(rootJobId),
      };
    },

    runDurableBulkMutationChild<TResult>(
      ref: DurableBulkMutationChildRef,
      jobId: string,
      mutation: () => Promise<TResult>,
    ): Promise<TResult> {
      return backend.runDurableBulkMutationChild(
        {
          source,
          operationId: ref.rootJobId,
          rootJobId: ref.rootJobId,
          childKey: ref.childKey,
          expectedChildren: ref.expectedChildren,
          jobId,
        },
        mutation,
      );
    },

    async settleDurableBulkMutationChild(
      ref: DurableBulkMutationChildRef,
      jobId: string,
      outcome: "completed" | "failed",
    ): Promise<void> {
      await backend.settleDurableBulkMutationChild({
        operationId: ref.rootJobId,
        childKey: ref.childKey,
        jobId,
        outcome,
      });
    },
  };
}
