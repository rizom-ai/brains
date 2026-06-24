import { z } from "@brains/utils";

/** Canonical role of a stored conversation message. */
export type MessageRole = "user" | "assistant";

export const messageRoleSchema: z.ZodType<MessageRole> = z.enum([
  "user",
  "assistant",
]);
