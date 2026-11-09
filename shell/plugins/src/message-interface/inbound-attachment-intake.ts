import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import type { ChatAttachment } from "../contracts/agent";
import type { ScopedRuntimeUploadStore } from "../service/upload-registry";
import {
  inboundAttachmentBytesSchema,
  inboundMessageAttachmentSchema,
} from "./inbound-attachment";
import {
  getMessageUploadKind,
  isMessageUploadDeclaredSizeAllowed,
  normalizeMessageUploadMediaType,
  sanitizeUploadFilename,
  validateMessageUpload,
} from "./upload-policy";

/** What a message's attachments came to: what the turn gets, and what it skipped. */
export interface InboundAttachmentIntake {
  readonly attachments: readonly ChatAttachment[];
  readonly notices: readonly string[];
}

export interface InboundAttachmentIntakeInput {
  /** The interface's lazy list; what it returns is checked, not trusted. */
  readonly list: () => Promise<readonly unknown[]>;
  readonly store: Pick<ScopedRuntimeUploadStore, "save">;
  /** Who sent it and where, kept with every stored upload. */
  readonly metadata: Record<string, unknown>;
  readonly signal: AbortSignal;
  readonly logger: Logger;
}

type IntakeResult =
  { readonly attachment: ChatAttachment } | { readonly notice: string };

const namedSchema = z.object({ name: z.string().min(1) });

/**
 * Takes a message's attachments the way chat takes its uploads: each is
 * checked by the message upload policy, kept in the shared upload store with
 * who sent it, and handed to the turn with a reference a later turn restores
 * it by. One that fails is skipped with a notice the sender is shown, never a
 * failed turn.
 */
export async function takeInboundAttachments(
  input: InboundAttachmentIntakeInput,
): Promise<InboundAttachmentIntake> {
  let listed: readonly unknown[];
  try {
    listed = await input.list();
  } catch (error) {
    input.logger.error("Inbound attachments could not be listed", {
      error: getErrorMessage(error),
    });
    return { attachments: [], notices: ["Could not read file uploads"] };
  }
  // One at a time, so a message's notices keep its attachments' order.
  const results = await listed.reduce<Promise<IntakeResult[]>>(
    async (taken, raw) => [...(await taken), await takeOne(raw, input)],
    Promise.resolve([]),
  );
  return {
    attachments: results.flatMap((result) =>
      "attachment" in result ? [result.attachment] : [],
    ),
    notices: results.flatMap((result) =>
      "notice" in result ? [result.notice] : [],
    ),
  };
}

async function takeOne(
  raw: unknown,
  input: InboundAttachmentIntakeInput,
): Promise<IntakeResult> {
  const parsed = inboundMessageAttachmentSchema.safeParse(raw);
  if (!parsed.success) {
    const name = namedSchema.safeParse(raw).data?.name ?? "upload";
    input.logger.warn("Inbound attachment is neither a link nor bytes", {
      name,
    });
    return { notice: `Could not read file upload: ${name}` };
  }
  const attachment = parsed.data;
  const filename = sanitizeUploadFilename(attachment.name, "upload");
  const mediaType = normalizeMessageUploadMediaType(
    filename,
    attachment.mediaType,
  );
  const kind = getMessageUploadKind(filename, mediaType);
  if (!kind) return { notice: `Unsupported file upload type: ${filename}` };

  try {
    const content =
      attachment.read !== undefined
        ? inboundAttachmentBytesSchema.parse(await attachment.read())
        : await download(attachment.url, kind, input.signal);
    if (content === "too-large") {
      return { notice: `File upload too large: ${filename}` };
    }
    const validation = validateMessageUpload({
      filename,
      mediaType,
      content,
      fallbackFilename: "upload",
    });
    if (!validation.ok) return { notice: validation.message };
    const record = await input.store.save({
      filename: validation.filename,
      mediaType: validation.mediaType,
      content,
      metadata: input.metadata,
    });
    const source = { kind: record.ref.kind, id: record.ref.id };
    return {
      attachment:
        validation.kind === "text"
          ? {
              kind: "text",
              filename: record.filename,
              mediaType: record.mediaType,
              content: validation.text,
              sizeBytes: content.byteLength,
              source,
            }
          : {
              kind: "file",
              filename: record.filename,
              mediaType: record.mediaType,
              data: content,
              sizeBytes: content.byteLength,
              source,
            },
    };
  } catch (error) {
    input.logger.error("Inbound attachment could not be read", {
      filename,
      error: getErrorMessage(error),
    });
    return { notice: `Could not read file upload: ${filename}` };
  }
}

/**
 * Fetches a linked attachment; one whose declared length is over the upload
 * limit is refused before its body is read.
 */
async function download(
  url: string,
  kind: "text" | "file",
  signal: AbortSignal,
): Promise<Uint8Array | "too-large"> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Attachment download failed (${response.status})`);
  }
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (!isMessageUploadDeclaredSizeAllowed(kind, declared)) {
    await response.body?.cancel();
    return "too-large";
  }
  return new Uint8Array(await response.arrayBuffer());
}
