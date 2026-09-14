import { isAbsolute } from "node:path";
import { z } from "@brains/utils/zod";
import { assetRefSchema, getAssetDigest } from "@brains/assets";
import {
  binaryUploadSizeSchema,
  type BinaryUploadReceipt,
} from "@brains/db/binary-publication";
import type {
  FileProcessOwner,
  BlobFacts,
} from "@brains/db/file-process-owner";
import type { EntityBinaryClient } from "./entity-binary-client";
import {
  parseEntityPublicationRpcRequest,
  type EntityPublicationRpcRequest,
} from "./entity-rpc";
import type { EntityMutationResult } from "./types";

type WithoutTicket<T> = T extends EntityPublicationRpcRequest
  ? Omit<T, "assetUploadId">
  : never;
export type EntityFilePublicationRequest =
  WithoutTicket<EntityPublicationRpcRequest>;
export interface EntityFilePublicationInput {
  sourceFile: string;
  sizeBytes: number;
  publication: EntityFilePublicationRequest;
}
export type EntityFileUploadActor = Pick<FileProcessOwner, "upload">;
type Control = Pick<
  EntityBinaryClient,
  "offer" | "upload" | "endpoint" | "cancel" | "publish"
> & { fence(error: unknown): void };
const inputSchema = z.strictObject({
  sourceFile: z.string().min(1).max(4096).refine(isAbsolute),
  sizeBytes: binaryUploadSizeSchema,
  publication: z.strictObject({
    operation: z.enum(["createEntity", "updateEntity", "upsertEntity"]),
    request: z.unknown(),
  }),
});
type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };
async function observe<T>(operation: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    return { ok: false, error };
  }
}
function failure(errors: unknown[]): unknown {
  return errors.length === 1
    ? errors[0]
    : new AggregateError(errors, "File publication and retirement failed", {
        cause: errors[0],
      });
}
/** File-only ingress. A validated metadata request and both verified transfer
 * receipts precede publication. After submission, cancellation cannot retract or
 * replay the mutation: observe its real reply, fencing any unavailable outcome.
 * Actor/connection ownership stays with the caller, who must join this handoff.
 */
export async function publishEntityFile(
  control: Control,
  actors: EntityFileUploadActor,
  input: EntityFilePublicationInput,
  signal?: AbortSignal,
): Promise<EntityMutationResult> {
  const parsed = inputSchema.parse(input);
  // Syntactic validation only; this placeholder is never sent or used as authority.
  const template = parseEntityPublicationRpcRequest({
    ...parsed.publication,
    assetUploadId: "00000000-0000-4000-8000-000000000000",
  });
  signal?.throwIfAborted();
  const expectedDigest = getAssetDigest(
    assetRefSchema.parse(template.request.entity.content),
  );
  const errors: unknown[] = [];
  const remember = (error: unknown): void => {
    if (!errors.includes(error)) errors.push(error);
  };
  const fence = (): void => {
    try {
      control.fence(failure(errors));
    } catch (error) {
      remember(error);
    }
  };
  const offered = await observe(() => control.offer(parsed.sizeBytes));
  if (!offered.ok) {
    if (signal?.aborted) remember(signal.reason);
    remember(offered.error);
    fence();
    throw failure(errors);
  }
  const cancellation = new AbortController();
  const state: {
    submitted: boolean;
    fenceNeeded: boolean;
    retirement?: Promise<Outcome<void>>;
  } = { submitted: false, fenceNeeded: false };
  let native: Promise<Outcome<BinaryUploadReceipt>> | undefined;
  let actor: Promise<Outcome<BlobFacts>> | undefined;
  let result: EntityMutationResult | undefined;
  const stop = (error: unknown): void => {
    if (state.submitted) return;
    remember(error);
    cancellation.abort(error);
    state.retirement ??= observe(() => control.cancel(offered.value.ticket));
  };
  const abort = (): void =>
    stop(signal?.reason ?? new Error("File publication cancelled"));
  signal?.addEventListener("abort", abort, { once: true });
  try {
    signal?.throwIfAborted();
    native = observe(() => control.upload(offered.value.ticket)).then(
      (outcome): Outcome<BinaryUploadReceipt> => {
        if (!outcome.ok) stop(outcome.error);
        return outcome;
      },
    );
    const endpoint = await control.endpoint(offered.value.ticket);
    cancellation.signal.throwIfAborted();
    actor = observe(() =>
      actors.upload(
        { endpoint, size: parsed.sizeBytes, sourceFile: parsed.sourceFile },
        cancellation.signal,
      ),
    ).then((outcome): Outcome<BlobFacts> => {
      if (!outcome.ok) stop(outcome.error);
      return outcome;
    });
    const [sealed, produced] = await Promise.all([native, actor]);
    if (sealed.ok && produced.ok) {
      if (
        sealed.value.sha256 !== produced.value.sha256 ||
        sealed.value.sizeBytes !== produced.value.sizeBytes
      ) {
        state.fenceNeeded = true;
        throw new Error("Upload actor and native receipts disagree");
      }
      if (
        sealed.value.sizeBytes !== parsed.sizeBytes ||
        sealed.value.sha256 !== expectedDigest
      )
        throw new Error(
          "File publication digest or size does not match its entity",
        );
      cancellation.signal.throwIfAborted();
      if (errors.length === 0) {
        state.submitted = true; // No await between the final liveness check and submission.
        const published = await observe(() =>
          control.publish({ ...template, assetUploadId: sealed.value.ticket }),
        );
        if (published.ok) result = published.value;
        else {
          remember(published.error);
          state.fenceNeeded = true;
        }
      }
    }
  } catch (error) {
    stop(error);
  } finally {
    await Promise.all([native, actor]);
    if (state.retirement) {
      const retired = await state.retirement;
      if (!retired.ok) {
        remember(retired.error);
        state.fenceNeeded = true;
      }
    }
    if (state.fenceNeeded) fence();
    signal?.removeEventListener("abort", abort);
  }
  if (errors.length > 0) throw failure(errors);
  if (!result) throw new Error("File publication has no acknowledged outcome");
  return result;
}
