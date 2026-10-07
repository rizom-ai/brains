import type { Logger } from "@brains/utils/logger";
import { SdkError, toSdkError } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import type { EntityConversationReader } from "../job/job-context-contract";
import type { Message } from "../contracts/conversations";

/** Low-level callback projections must not depend on base context namespaces. */
export function createPluginLogger(source: Logger): Logger {
  return Object.freeze({
    silly: source.silly.bind(source),
    verbose: source.verbose.bind(source),
    debug: source.debug.bind(source),
    info: source.info.bind(source),
    warn: source.warn.bind(source),
    error: source.error.bind(source),
    child: (context: string) => createPluginLogger(source.child(context)),
    setUseStderr: source.setUseStderr.bind(source),
  });
}

const messageWindowSchema = z
  .strictObject({
    start: z.number().int().positive(),
    end: z.number().int().positive(),
  })
  .refine(({ start, end }) => end >= start && end - start < 100);

export function createConversationReader(
  source: Pick<EntityConversationReader, "get" | "getManyWithMessages"> & {
    getMessages(
      id: string,
      options?:
        | { limit?: number; range?: never }
        | { range: { start: number; end: number }; limit?: never },
    ): Promise<Message[]>;
  },
): EntityConversationReader {
  return Object.freeze({
    get: source.get.bind(source),
    getMessages: async (id, options): Promise<Message[]> => {
      try {
        const requestedRange = options?.range;
        const limit = options?.limit;
        if (requestedRange === undefined)
          return await source.getMessages(
            id,
            limit === undefined ? undefined : { limit },
          );
        const parsed = messageWindowSchema.safeParse(requestedRange);
        if (!parsed.success || limit !== undefined)
          throw new SdkError("invalid_input", {
            cause: parsed.success ? undefined : parsed.error,
          });
        const range = parsed.data;
        const messages = await source.getMessages(id, { range });
        if (messages.length > range.end - range.start + 1)
          throw new SdkError("invalid_response");
        return messages;
      } catch (cause) {
        throw toSdkError(cause);
      }
    },
    getManyWithMessages: source.getManyWithMessages.bind(source),
  } satisfies EntityConversationReader);
}
