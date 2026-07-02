import { z } from "@brains/utils/zod-v4";

/** Canonical role of a stored conversation message. */
export type MessageRole = "user" | "assistant";

export const messageRoleSchema: z.ZodType<MessageRole, MessageRole> = z.enum([
  "user",
  "assistant",
]);
