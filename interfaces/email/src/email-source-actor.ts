import type { ImapFlow } from "imapflow";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { z } from "@brains/utils/zod";
import type { FileProduceInput } from "@brains/db/file-produce";
import {
  createImapFlow,
  connectImapWithIpv4TlsFallback,
  emailImapConfigSchema,
  createInboundEmailSourceRef,
} from "./inbound-email";
import { parseRawInboundEmail, type RawEmailSource } from "./mime-parser";
import {
  emailSourceResultSchema,
  MAX_EMAIL_SOURCE_BYTES,
  MAX_EMAIL_TEXT_BYTES,
  type EmailSourceRequest,
} from "./email-source";

export const emailSourceRequestSchema: z.ZodType<EmailSourceRequest> =
  z.strictObject({
    config: emailImapConfigSchema.strict(),
    selection: z.strictObject({
      mailbox: z.string().min(1),
      uidValidity: z.string().regex(/^\d+$/),
    }),
    uid: z.number().int().min(1).max(0xffffffff),
    maxBytes: z.number().int().positive().max(MAX_EMAIL_SOURCE_BYTES),
    allowTruncated: z.boolean(),
  });
export type EmailSourceReader = (
  request: EmailSourceRequest,
  signal: AbortSignal,
) => Promise<RawEmailSource | undefined>;

/** Raw literals and attachment materialization stay in this actor. */
export async function readImapSource(
  request: EmailSourceRequest,
  signal: AbortSignal,
  createTransport: (
    config: EmailSourceRequest["config"],
    family?: 4,
  ) => ImapFlow = createImapFlow,
): Promise<RawEmailSource | undefined> {
  signal.throwIfAborted();
  let client = createTransport(request.config);
  const abort = (): void => client.close();
  signal.addEventListener("abort", abort, { once: true });
  let value: RawEmailSource | undefined;
  const failures: unknown[] = [];
  try {
    client = await connectImapWithIpv4TlsFallback(
      request.config.host,
      async (family) => {
        if (family === 4) {
          client.close();
          client = createTransport(request.config, family);
        }
        await client.connect();
        return client;
      },
      signal,
    );
    const selected = await client.mailboxOpen(request.selection.mailbox, {
      readOnly: true,
    });
    signal.throwIfAborted();
    if (selected.uidValidity.toString() !== request.selection.uidValidity)
      throw new Error("Email source mailbox generation changed");
    const meta = await client.fetchOne(
      String(request.uid),
      { uid: true, size: true },
      { uid: true },
    );
    signal.throwIfAborted();
    if (meta && meta.uid === request.uid) {
      const size = z.number().int().nonnegative().parse(meta.size);
      if (request.allowTruncated || size <= request.maxBytes) {
        const message = await client.fetchOne(
          String(request.uid),
          {
            uid: true,
            source: { maxLength: request.maxBytes },
            internalDate: true,
            threadId: true,
          },
          { uid: true },
        );
        signal.throwIfAborted();
        if (
          message &&
          message.uid === request.uid &&
          message.source &&
          message.internalDate
        ) {
          if (message.source.byteLength > request.maxBytes)
            throw new Error("Email source exceeds its binary allowance");
          value = {
            uid: message.uid,
            source: message.source,
            receivedAt: new Date(message.internalDate),
            ...(message.threadId ? { threadId: message.threadId } : {}),
            ...(message.source.byteLength < size
              ? { sourceTruncated: true }
              : {}),
          };
          if (!request.allowTruncated && value.sourceTruncated)
            throw new Error("Email source was truncated during intake");
        }
      }
    }
  } catch (error) {
    failures.push(error);
  }
  try {
    if (client.usable && !signal.aborted) await client.logout();
    else client.close();
  } catch (error) {
    failures.push(error);
  }
  signal.removeEventListener("abort", abort);
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(
      failures,
      "Email retrieval and connection retirement failed",
      { cause: failures[0] },
    );
  signal.throwIfAborted();
  return value;
}

export async function produceEmailSource(
  input: FileProduceInput,
  signal: AbortSignal,
  readSource: EmailSourceReader = readImapSource,
): Promise<{ sizeBytes: number; sha256: string }> {
  signal.throwIfAborted();
  const request = emailSourceRequestSchema.parse(
    JSON.parse(z.string().parse(input.metadata?.["request"])),
  );
  const source = await readSource(request, signal);
  signal.throwIfAborted();
  if (
    source &&
    (source.uid !== request.uid ||
      source.source.byteLength > request.maxBytes ||
      (!request.allowTruncated && source.sourceTruncated))
  )
    throw new Error("Email source retrieval facts mismatch");
  let email: Awaited<ReturnType<typeof parseRawInboundEmail>> | undefined;
  if (source) {
    try {
      email = await parseRawInboundEmail(
        source,
        createInboundEmailSourceRef(request.selection, request.uid),
      );
    } catch {
      signal.throwIfAborted(); /* Invalid MIME is a known parse rejection, not an uncertain transport failure. */
    }
  }
  signal.throwIfAborted();
  const result = emailSourceResultSchema.parse({
    uid: request.uid,
    sourceBytes: source?.source.byteLength ?? 0,
    ...(source?.sourceTruncated ? { sourceTruncated: true } : {}),
    ...(email ? { email } : {}),
  });
  const text = JSON.stringify(result);
  const sizeBytes = Buffer.byteLength(text);
  if (sizeBytes > MAX_EMAIL_TEXT_BYTES)
    throw new Error("Parsed email exceeds its logical text allowance");
  await writeFile(input.outputFile, text, { flag: "wx", mode: 0o600, signal });
  signal.throwIfAborted();
  return { sizeBytes, sha256: createHash("sha256").update(text).digest("hex") };
}
