import { z } from "@brains/utils/zod";

type MessageRoleSchema = z.ZodEnum<{ user: "user"; assistant: "assistant" }>;

export const messageRoleSchema: MessageRoleSchema = z.enum([
  "user",
  "assistant",
]);

/** Canonical role of a stored conversation message. */
export type MessageRole = z.output<typeof messageRoleSchema>;
