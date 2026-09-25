import { isAbsolute } from "node:path";
import {
  ReceivedEntityFileHttpError,
  type EntityServiceClient,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { CHAT_NATIVE_ARTIFACT_MAX_BYTES } from "./artifact-limits";
import type { FileDeliveryAdapter } from "./file-delivery";

type PostFile = NonNullable<EntityServiceClient["fileAssets"]>["postHttp"];
export interface SlackFileDeliveryInput {
  sourceFile: string;
  sizeBytes: number;
  sha256: string;
  filename: string;
  channelId: string;
  threadTs?: string | undefined;
}
export interface SlackUploadInitialization {
  filename: string;
  length: number;
}
export interface SlackUploadCompletionFile {
  id: string;
  title: string;
}
export interface SlackUploadCompletion {
  files: SlackUploadCompletionFile[];
  channel_id: string;
  thread_ts?: string;
}
export interface SlackFileDeliveryReceipt {
  fileId: string;
}
export type SlackFileDeliveryStage =
  | "initialized"
  | "upload-received"
  | "uploaded"
  | "share-attempted"
  | "share-response-received";
export interface SlackFileDeliveryRecovery {
  fileId: string;
  channelId: string;
  threadTs?: string | undefined;
  sha256: string;
  stage: SlackFileDeliveryStage;
  completedFileId?: string | undefined;
}
/** Partial evidence is neither a shared file nor permission to replay. */
export class PartialSlackFileDeliveryError extends Error {
  public readonly recovery: Readonly<SlackFileDeliveryRecovery>;
  constructor(recovery: SlackFileDeliveryRecovery, cause: unknown) {
    super("Slack file delivery failed after upload initialization", { cause });
    this.name = "PartialSlackFileDeliveryError";
    this.recovery = Object.freeze({
      fileId: recovery.fileId,
      channelId: recovery.channelId,
      sha256: recovery.sha256,
      stage: recovery.stage,
      ...(recovery.threadTs !== undefined && { threadTs: recovery.threadTs }),
      ...(recovery.completedFileId !== undefined && {
        completedFileId: recovery.completedFileId,
      }),
    });
  }
}

export interface SlackFileDeliveryTarget {
  channelId: string;
  threadTs?: string | undefined;
}
/** Bind Slack routing and transport details behind the shared delivery contract. */
export function createSlackFileDeliveryAdapter(
  target: SlackFileDeliveryTarget,
  deps: SlackFileDeliveryDeps,
): FileDeliveryAdapter<SlackFileDeliveryReceipt> {
  const { channelId, threadTs } = target;
  return {
    deliver: (file, signal): Promise<SlackFileDeliveryReceipt> =>
      deliverSlackFile(
        {
          sourceFile: file.sourceFile,
          sizeBytes: file.sizeBytes,
          sha256: file.sha256,
          filename: file.filename,
          channelId,
          ...(threadTs !== undefined && { threadTs }),
        },
        deps,
        signal,
      ),
  };
}
/** Metadata collaborators must be single-attempt, bounded API calls and join
 * their submitted outcomes. Do not inject the SDK's buffered uploadV2 helper.
 */
export interface SlackFileDeliveryDeps {
  initialize(
    input: SlackUploadInitialization,
    signal?: AbortSignal,
  ): Promise<unknown>;
  /** Inject a bound runtime delegate; never a controller-side file upload. */
  postHttp: PostFile;
  complete(
    input: SlackUploadCompletion,
    signal?: AbortSignal,
  ): Promise<unknown>;
}
const digestSchema = z
  .string()
  .length(64)
  .regex(/^[a-f0-9]{64}$/);
const fileIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^F[A-Z0-9]+$/)
  .refine((value) => value.trim() === value);
export const slackFileDeliveryInputSchema: z.ZodType<SlackFileDeliveryInput> =
  z.strictObject({
    sourceFile: z
      .string()
      .min(1)
      .max(4096)
      .refine((path) => isAbsolute(path) && !path.includes("\0")),
    sizeBytes: z.number().int().positive().max(CHAT_NATIVE_ARTIFACT_MAX_BYTES),
    sha256: digestSchema,
    filename: z
      .string()
      .min(1)
      .max(255)
      .refine((name) => !/[\0\r\n]/.test(name)),
    channelId: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9]+$/)
      .refine((value) => value.trim() === value),
    threadTs: z
      .string()
      .max(64)
      .regex(/^\d+\.\d+$/)
      .refine((value) => value.trim() === value)
      .optional(),
  });
const initializationSchema = z.object({
  ok: z.literal(true),
  file_id: fileIdSchema,
  upload_url: z
    .url()
    .max(4096)
    .refine((url) => ["http:", "https:"].includes(new URL(url).protocol)),
});
const completionSchema = z.object({
  ok: z.literal(true),
  files: z.array(z.object({ id: fileIdSchema })).length(1),
});
const uploadReceiptSchema = z.strictObject({
  statusCode: z.literal(200),
  sizeBytes: z.number().int().positive().max(CHAT_NATIVE_ARTIFACT_MAX_BYTES),
  sha256: digestSchema,
});

function receivedUploadMatches(
  error: unknown,
  source: SlackFileDeliveryInput,
): boolean {
  if (!(error instanceof ReceivedEntityFileHttpError)) return false;
  try {
    const parsed = uploadReceiptSchema.safeParse(error.outcome);
    return (
      parsed.success &&
      parsed.data.sizeBytes === source.sizeBytes &&
      parsed.data.sha256 === source.sha256
    );
  } catch {
    // Invalid evidence cannot advance the stage or replace the original cause.
    return false;
  }
}

/** Call only after entity authorization and inside an owned file loan. Paths and
 * facts are not authorization or immutable snapshots. Awaiting this operation
 * includes upload retirement and Slack's complete/share reply.
 * A failed or cancelled share is not retracted or retried. The caller retains
 * failed staging; this helper neither deletes remote files nor releases loans.
 */
export async function deliverSlackFile(
  input: SlackFileDeliveryInput,
  deps: SlackFileDeliveryDeps,
  signal?: AbortSignal,
): Promise<SlackFileDeliveryReceipt> {
  signal?.throwIfAborted();
  const source = slackFileDeliveryInputSchema.parse(input);
  const initialized = initializationSchema.parse(
    await deps.initialize(
      {
        filename: source.filename,
        length: source.sizeBytes,
      },
      signal,
    ),
  );
  let stage: SlackFileDeliveryStage = "initialized";
  let completedFileId: string | undefined;
  try {
    signal?.throwIfAborted();
    const uploaded = uploadReceiptSchema.parse(
      await deps
        .postHttp(
          {
            sourceFile: source.sourceFile,
            facts: { sizeBytes: source.sizeBytes, sha256: source.sha256 },
            url: initialized.upload_url,
            headers: { "content-type": "application/octet-stream" },
          },
          signal ? { signal } : undefined,
        )
        .catch((error: unknown): never => {
          if (receivedUploadMatches(error, source)) stage = "upload-received";
          throw error;
        }),
    );
    if (
      uploaded.sizeBytes !== source.sizeBytes ||
      uploaded.sha256 !== source.sha256
    )
      throw new Error("Slack file upload receipt does not match its source");
    stage = "uploaded";
    // A verified upload does not authorize sharing after cancellation. Once the
    // share is submitted, however, observe its outcome rather than retracting it.
    signal?.throwIfAborted();
    stage = "share-attempted";
    const completed = completionSchema.parse(
      await deps.complete(
        {
          files: [{ id: initialized.file_id, title: source.filename }],
          channel_id: source.channelId,
          ...(source.threadTs !== undefined && { thread_ts: source.threadTs }),
        },
        signal,
      ),
    );
    stage = "share-response-received";
    completedFileId = completed.files[0]?.id;
    if (completedFileId !== initialized.file_id)
      throw new Error("Slack file completion acknowledged a different file");
    return { fileId: initialized.file_id };
  } catch (error) {
    throw new PartialSlackFileDeliveryError(
      {
        fileId: initialized.file_id,
        channelId: source.channelId,
        sha256: source.sha256,
        stage,
        ...(source.threadTs !== undefined && { threadTs: source.threadTs }),
        ...(completedFileId !== undefined && { completedFileId }),
      },
      error,
    );
  }
}
