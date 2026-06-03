import { z } from "@brains/utils";

/**
 * Conversation metadata is stored as JSON text in SQLite but flows through
 * the API as a plain object. This schema accepts either shape and falls back
 * to `{}` for anything else (legacy null, parse errors, non-record JSON).
 */
export const conversationMetadataSchema = z
  .preprocess((value) => {
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }, z.record(z.unknown()))
  .catch({});

export const coerceConversationMetadata = (
  value: unknown,
): Record<string, unknown> => conversationMetadataSchema.parse(value);
