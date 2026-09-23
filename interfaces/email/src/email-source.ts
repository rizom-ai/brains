import type { InterfaceFileTransfers } from "@brains/plugins";
import { inboundEmailSchema } from "@brains/contracts";
import { readExtractedTextFile } from "@brains/document/extracted-text-file";
import { z } from "@brains/utils/zod";
import type {
  EmailImapConfig,
  InboundEmailSelection,
  InboundEmailSourceMessage,
} from "./inbound-email";

export const MAX_EMAIL_SOURCE_BYTES: number = 100 * 1024 * 1024;
export const MAX_EMAIL_TEXT_BYTES: number = 16 * 1024 * 1024 - 64 * 1024;
export type EmailSourceFiles = Pick<InterfaceFileTransfers, "withProducedFile">;
export interface EmailSourceRequest {
  config: EmailImapConfig;
  selection: InboundEmailSelection;
  uid: number;
  maxBytes: number;
  allowTruncated: boolean;
}
export const emailSourceResultSchema: z.ZodType<InboundEmailSourceMessage> =
  z.strictObject({
    uid: z.number().int().min(1).max(0xffffffff),
    sourceBytes: z.number().int().nonnegative().max(MAX_EMAIL_SOURCE_BYTES),
    email: inboundEmailSchema.optional(),
    sourceTruncated: z.boolean().optional(),
  });
export async function readOwnedEmailSource(
  files: EmailSourceFiles | undefined,
  request: EmailSourceRequest,
  signal: AbortSignal,
): Promise<InboundEmailSourceMessage> {
  signal.throwIfAborted();
  if (!files?.withProducedFile)
    throw new Error("Native email source parsing is not provisioned");
  const encoded = JSON.stringify(request);
  if (Buffer.byteLength(encoded) > 64 * 1024)
    throw new Error("Email source request exceeds metadata allowance");
  const result = await files.withProducedFile(
    undefined,
    async (file, loanSignal) => {
      const text = await readExtractedTextFile(file.sourceFile, {
        ...file,
        maxBytes: MAX_EMAIL_TEXT_BYTES,
        signal: loanSignal,
      });
      const parsed = emailSourceResultSchema.parse(JSON.parse(text));
      if (
        parsed.uid !== request.uid ||
        parsed.sourceBytes > request.maxBytes ||
        (!request.allowTruncated && parsed.sourceTruncated)
      )
        throw new Error("Native email source receipt mismatch");
      loanSignal.throwIfAborted();
      return parsed;
    },
    { producer: "email-source", metadata: { request: encoded }, signal },
  );
  signal.throwIfAborted();
  return result;
}
