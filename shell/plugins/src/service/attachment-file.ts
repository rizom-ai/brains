import { z } from "@brains/utils/zod";
import {
  entityFileSourceSchema,
  type EntityFileSource,
} from "@brains/entity-service";
import type { AttachmentResolveRequest } from "./attachment-registry";

/** A borrowed file descriptor, not provenance or filesystem authorization.
 * Consumers must inspect/verify bytes through their owned file capability.
 */
export type AttachmentFile = {
  source: EntityFileSource;
  filename: string;
} & (
  | { type: "image"; mimeType: "image/png" }
  | { type: "document"; mimeType: "application/pdf" }
);
export const attachmentFileSchema: z.ZodType<AttachmentFile> =
  z.discriminatedUnion("type", [
    z.strictObject({
      type: z.literal("image"),
      mimeType: z.literal("image/png"),
      source: entityFileSourceSchema,
      filename: z
        .string()
        .min(1)
        .max(255)
        .refine((value) => !value.includes("\0")),
    }),
    z.strictObject({
      type: z.literal("document"),
      mimeType: z.literal("application/pdf"),
      source: entityFileSourceSchema,
      filename: z
        .string()
        .min(1)
        .max(255)
        .refine((value) => !value.includes("\0")),
    }),
  ]);
export interface AttachmentFileOptions {
  signal?: AbortSignal | undefined;
}
export type AttachmentFileConsumer<T> = (
  file: AttachmentFile,
  signal: AbortSignal,
) => Promise<T>;
/** Providers own staging and producer cleanup. They must await the consumer
 * before releasing its file, retain interrupted staging, and acknowledge their
 * own cleanup before returning. The callback signal must combine caller and
 * producer lifetime cancellation. No buffered resolution fallback is permitted.
 */
export type AttachmentFileResolver = <T>(
  request: AttachmentResolveRequest,
  use: AttachmentFileConsumer<T>,
  options?: AttachmentFileOptions,
) => Promise<T | undefined>;
type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

/** Validate a single loan and join both callback and provider settlement.
 * This cannot repair a provider that prematurely deletes its borrowed file;
 * providers must uphold the lifetime contract themselves.
 */
export async function consumeAttachmentFile<T>(
  resolve: AttachmentFileResolver,
  request: AttachmentResolveRequest,
  use: AttachmentFileConsumer<T>,
  options?: AttachmentFileOptions,
): Promise<T | undefined> {
  options?.signal?.throwIfAborted();
  let started = false;
  let open = true;
  let consumption: Promise<T> | undefined;
  const protocolErrors: unknown[] = [];
  let provider: Outcome<T | undefined>;
  try {
    provider = {
      ok: true,
      value: await resolve(
        request,
        (input, signal): Promise<T> => {
          if (!open || started) {
            const error = new Error(
              "Attachment file consumer is closed or already entered",
            );
            if (protocolErrors.length === 0) protocolErrors.push(error);
            const rejected = Promise.reject<T>(error);
            void rejected.catch(() => undefined); // Also retained in protocolErrors for the active loan.
            return rejected;
          }
          started = true;
          consumption = Promise.resolve().then(() => {
            options?.signal?.throwIfAborted();
            signal.throwIfAborted();
            return use(attachmentFileSchema.parse(input), signal);
          });
          // Observed below even if the provider returns or throws before joining it.
          void consumption.catch(() => undefined);
          return consumption;
        },
        options,
      ),
    };
  } catch (error) {
    provider = { ok: false, error };
  } finally {
    open = false;
  }
  let consumer: Outcome<T> | undefined;
  if (consumption) {
    try {
      consumer = { ok: true, value: await consumption };
    } catch (error) {
      consumer = { ok: false, error };
    }
  }
  const errors: unknown[] = [];
  const remember = (error: unknown): void => {
    if (!errors.includes(error)) errors.push(error);
  };
  if (consumer && !consumer.ok) remember(consumer.error);
  for (const error of protocolErrors) remember(error);
  if (!provider.ok) remember(provider.error);
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(
      errors,
      "Attachment file consumption and provider cleanup failed",
      { cause: errors[0] },
    );
  if (!provider.ok || (consumer && !consumer.ok))
    throw new Error("Attachment file outcome is unavailable");
  if (!Object.is(provider.value, consumer?.value))
    throw new Error(
      "Attachment file provider did not return the consumer outcome",
    );
  return consumer?.value;
}
