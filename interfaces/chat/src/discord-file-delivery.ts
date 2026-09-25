import { z } from "@brains/utils/zod";
import {
  ReceivedEntityFileHttpError,
  type InterfaceFileTransfers,
} from "@brains/plugins";
import {
  artifactDeliveryFileSchema,
  type FileDeliveryAdapter,
  type ArtifactDeliveryFile,
} from "./file-delivery";

export interface DiscordFileDeliveryTarget {
  channelId: string;
  botToken: string;
}
export interface DiscordFileDeliveryReceipt {
  messageId: string;
  channelId: string;
  attachmentId: string;
}
export type DiscordFileDeliveryDeps = Pick<InterfaceFileTransfers, "postHttp">;

/** A validated Discord response was received, but delivery did not complete.
 * Keep IDs for investigation; this is not permission to retry or mark delivered.
 */
export class ReceivedDiscordFileDeliveryError extends Error {
  public readonly receipt: Readonly<DiscordFileDeliveryReceipt>;
  constructor(receipt: DiscordFileDeliveryReceipt, cause: unknown) {
    super("Discord message receipt received but file delivery failed", {
      cause,
    });
    this.name = "ReceivedDiscordFileDeliveryError";
    this.receipt = Object.freeze({
      messageId: receipt.messageId,
      channelId: receipt.channelId,
      attachmentId: receipt.attachmentId,
    });
  }
}
const discordFileSchema = artifactDeliveryFileSchema.refine(
  (value) => value.filename.length <= 255,
  "Discord filename exceeds its limit",
);
const snowflakeSchema = z
  .string()
  .regex(/^[1-9]\d{0,19}$/)
  .refine((value) => value.trim() === value);
const targetSchema: z.ZodType<DiscordFileDeliveryTarget> = z.strictObject({
  channelId: snowflakeSchema,
  botToken: z
    .string()
    .min(1)
    .max(4092)
    .regex(/^[\x21-\x7e]+$/)
    .refine((value) => value.trim() === value),
});
const receiptSchema = z.strictObject({
  messageId: snowflakeSchema,
  channelId: snowflakeSchema,
  attachmentId: snowflakeSchema,
  attachmentCount: z.literal(1),
  filename: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(),
});

function validateReceipt(
  result: Awaited<ReturnType<DiscordFileDeliveryDeps["postHttp"]>>,
  file: ArtifactDeliveryFile,
  routing: DiscordFileDeliveryTarget,
): DiscordFileDeliveryReceipt {
  if (
    result.statusCode !== 200 ||
    result.sizeBytes !== file.sizeBytes ||
    result.sha256 !== file.sha256
  )
    throw new Error(
      "Discord file upload receipt does not match its source or success status",
    );
  const receipt = receiptSchema.parse(result.responseMetadata);
  if (
    receipt.channelId !== routing.channelId ||
    receipt.filename !== file.filename ||
    receipt.sizeBytes !== file.sizeBytes
  )
    throw new Error("Discord message acknowledged a different file or channel");
  return {
    messageId: receipt.messageId,
    channelId: receipt.channelId,
    attachmentId: receipt.attachmentId,
  };
}

/** A single multipart message send. All file/framing/JSON processing is owned
 * by the existing HTTP actor; the adapter exchanges only bounded metadata.
 * Routing and credentials are captured, no SDK upload/retry or remote deletion.
 */
export function createDiscordFileDeliveryAdapter(
  target: DiscordFileDeliveryTarget,
  deps: DiscordFileDeliveryDeps,
): FileDeliveryAdapter<DiscordFileDeliveryReceipt> {
  const routing = targetSchema.parse(target);
  const postHttp = deps.postHttp.bind(deps);
  return {
    deliver: async (input, signal): Promise<DiscordFileDeliveryReceipt> => {
      signal.throwIfAborted();
      const file = discordFileSchema.parse(input);
      const result = await postHttp(
        {
          sourceFile: file.sourceFile,
          facts: { sizeBytes: file.sizeBytes, sha256: file.sha256 },
          url: `https://discord.com/api/v10/channels/${routing.channelId}/messages`,
          headers: { authorization: `Bot ${routing.botToken}` },
          multipart: {
            fieldName: "files[0]",
            filename: file.filename,
            mimeType: file.mimeType,
            fields: {
              payload_json: JSON.stringify({
                attachments: [{ id: 0, filename: file.filename }],
                allowed_mentions: { parse: [] },
              }),
            },
          },
          responseMetadata: {
            messageId: ["id"],
            channelId: ["channel_id"],
            attachmentId: ["attachments", 0, "id"],
            attachmentCount: ["attachments", "length"],
            filename: ["attachments", 0, "filename"],
            sizeBytes: ["attachments", 0, "size"],
          },
        },
        { signal },
      ).catch((error: unknown): never => {
        if (!(error instanceof ReceivedEntityFileHttpError)) throw error;
        let receipt: DiscordFileDeliveryReceipt;
        try {
          receipt = validateReceipt(error.outcome, file, routing);
        } catch {
          // Invalid evidence must not replace the original delivery failure.
          throw error;
        }
        throw new ReceivedDiscordFileDeliveryError(receipt, error);
      });
      // A validated acknowledgement after late cancellation is not retracted.
      return validateReceipt(result, file, routing);
    },
  };
}
