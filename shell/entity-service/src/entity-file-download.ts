import { isAbsolute } from "node:path";
import { z } from "@brains/utils/zod";
import { assetRefSchema, getAssetDigest, type AssetRef } from "@brains/assets";
import type { FileProcessOwner } from "@brains/db/file-process-owner";
import type {
  EntityBinaryClient,
  EntityBinaryReadFacts,
} from "./entity-binary-client";

export interface EntityFileDownloadInput {
  ref: AssetRef;
  outputFile: string;
}
export type EntityFileDownloadActor = Pick<FileProcessOwner, "download">;
type ReadControl = Pick<
  EntityBinaryClient,
  "offerRead" | "download" | "readEndpoint" | "cancelRead"
> & { fence(error: unknown): void };
const inputSchema: z.ZodType<EntityFileDownloadInput> = z.strictObject({
  ref: assetRefSchema,
  outputFile: z.string().min(1).max(4096).refine(isAbsolute),
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
    : new AggregateError(errors, "File download and retirement failed", {
        cause: errors[0],
      });
}
/** Borrowed control connection and actor owner. Never abort RPC response observation:
 * cancellation uses its own control request, and this handoff joins every operation
 * it starts. Missing offer receipts and unacknowledged retirement fence the client.
 * Caller-trusted output directories are not filesystem authorization.
 */
export async function downloadEntityFile(
  control: ReadControl,
  actors: EntityFileDownloadActor,
  input: EntityFileDownloadInput,
  signal?: AbortSignal,
): Promise<EntityBinaryReadFacts> {
  const parsed = inputSchema.parse(input);
  signal?.throwIfAborted();
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
  const offered = await observe(() => control.offerRead(parsed.ref));
  if (!offered.ok) {
    if (signal?.aborted) remember(signal.reason);
    remember(offered.error);
    fence(); // No trustworthy ticket with which to acknowledge retirement.
    throw failure(errors);
  }
  const offer = offered.value;
  const cancellation = new AbortController();
  const state: {
    nativeOK: boolean;
    fenceNeeded: boolean;
    retirement?: Promise<Outcome<void>>;
  } = { nativeOK: false, fenceNeeded: false };
  let native: Promise<Outcome<EntityBinaryReadFacts>> | undefined;
  let actor: Promise<Outcome<EntityBinaryReadFacts>> | undefined;
  const retire = (): void => {
    if (!state.nativeOK && !state.retirement)
      state.retirement = observe(() => control.cancelRead(offer.ticket));
  };
  const stop = (error: unknown): void => {
    remember(error);
    cancellation.abort(error);
    retire();
  };
  const abort = (): void =>
    stop(signal?.reason ?? new Error("File download cancelled"));
  signal?.addEventListener("abort", abort, { once: true });
  try {
    signal?.throwIfAborted();
    if (offer.sha256 !== getAssetDigest(parsed.ref)) {
      state.fenceNeeded = true;
      throw new Error("Read offer does not match its asset reference");
    }
    native = observe(() => control.download(offer.ticket)).then(
      (result): Outcome<EntityBinaryReadFacts> => {
        state.nativeOK = result.ok;
        if (!result.ok) stop(result.error);
        return result;
      },
    );
    const endpoint = await control.readEndpoint(offer.ticket);
    cancellation.signal.throwIfAborted();
    actor = observe(() =>
      actors.download(
        {
          endpoint,
          facts: { sizeBytes: offer.sizeBytes, sha256: offer.sha256 },
          outputFile: parsed.outputFile,
        },
        cancellation.signal,
      ),
    ).then((result): Outcome<EntityBinaryReadFacts> => {
      if (!result.ok) stop(result.error);
      return result;
    });
    const [delivered, published] = await Promise.all([native, actor]);
    if (
      (delivered.ok &&
        (delivered.value.sizeBytes !== offer.sizeBytes ||
          delivered.value.sha256 !== offer.sha256)) ||
      (published.ok &&
        (published.value.sizeBytes !== offer.sizeBytes ||
          published.value.sha256 !== offer.sha256))
    ) {
      state.fenceNeeded = true;
      stop(new Error("File handoff facts do not match the read offer"));
    }
  } catch (error) {
    stop(error);
  } finally {
    // Keep cancellation attached through cleanup; a published file is never retracted.
    await Promise.all([native, actor]);
    if (state.retirement) {
      const retired = await state.retirement;
      if (!retired.ok) {
        remember(retired.error);
        if (!state.nativeOK) state.fenceNeeded = true;
      }
    }
    if (state.fenceNeeded) fence();
    signal?.removeEventListener("abort", abort);
  }
  if (errors.length > 0) throw failure(errors);
  return { sizeBytes: offer.sizeBytes, sha256: offer.sha256 };
}
