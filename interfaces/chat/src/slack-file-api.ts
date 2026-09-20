import { z } from "@brains/utils/zod";
import { readBoundedJsonResponse } from "@brains/utils/bounded-json-response";
import { CHAT_NATIVE_ARTIFACT_MAX_BYTES } from "./artifact-limits";
import type { SlackFileDeliveryDeps } from "./slack-file-delivery";

export type SlackFileMetadataApi = Pick<
  SlackFileDeliveryDeps,
  "initialize" | "complete"
>;
export interface SlackMetadataFetch {
  (url: string, options: RequestInit): Promise<Response>;
}
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_REQUEST_BYTES = 16 * 1024;
const filenameSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => !/[\0\r\n]/.test(value));
const initializeSchema = z.strictObject({
  filename: filenameSchema,
  length: z.number().int().positive().max(CHAT_NATIVE_ARTIFACT_MAX_BYTES),
});
const completeSchema = z.strictObject({
  files: z
    .array(
      z.strictObject({
        id: z
          .string()
          .max(128)
          .regex(/^F[A-Z0-9]+$/),
        title: filenameSchema,
      }),
    )
    .length(1),
  channel_id: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9]+$/),
  thread_ts: z
    .string()
    .max(64)
    .regex(/^\d+\.\d+$/)
    .optional(),
});
const envelopeSchema = z.object({
  ok: z.boolean(),
  error: z
    .string()
    .max(128)
    .regex(/^[a-zA-Z0-9_]+$/)
    .optional(),
});

/** Slack metadata only. Never call uploadV2 or pass file bytes to this client.
 * One fetch per call, redirects rejected, no SDK or application-level retries.
 * Cancellation is passed to fetch, not raced against a submitted operation.
 */
export function createSlackFileMetadataApi(
  botToken: string,
  fetchImplementation: SlackMetadataFetch = fetch,
): SlackFileMetadataApi {
  const token = z
    .string()
    .min(1)
    .max(4096)
    .regex(/^[\x21-\x7e]+$/)
    .parse(botToken);
  const call = async (
    method: "files.getUploadURLExternal" | "files.completeUploadExternal",
    parameters: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<unknown> => {
    signal?.throwIfAborted();
    // URLSearchParams serialization is ASCII, so length is its byte length.
    const body = new URLSearchParams(parameters).toString();
    if (body.length > MAX_REQUEST_BYTES)
      throw new Error("Slack metadata request exceeds its limit");
    const response = await fetchImplementation(
      `https://slack.com/api/${method}`,
      {
        method: "POST",
        redirect: "error",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
        ...(signal && { signal }),
      },
    );
    const value = await readBoundedJsonResponse(response, MAX_RESPONSE_BYTES);
    const envelope = envelopeSchema.parse(value);
    if (!envelope.ok)
      throw new Error(
        `Slack ${method} rejected: ${envelope.error ?? "unknown_error"}`,
      );
    // No late abort check: preserve an already received acknowledgement.
    return value;
  };
  return {
    initialize: async (input, signal): Promise<unknown> => {
      signal?.throwIfAborted();
      const parsed = initializeSchema.parse(input);
      return call(
        "files.getUploadURLExternal",
        { filename: parsed.filename, length: String(parsed.length) },
        signal,
      );
    },
    complete: async (input, signal): Promise<unknown> => {
      signal?.throwIfAborted();
      const parsed = completeSchema.parse(input);
      return call(
        "files.completeUploadExternal",
        {
          files: JSON.stringify(parsed.files),
          channel_id: parsed.channel_id,
          ...(parsed.thread_ts !== undefined && {
            thread_ts: parsed.thread_ts,
          }),
        },
        signal,
      );
    },
  };
}
