import { z } from "@brains/utils/zod-v4";

/** Canonical role of a stored conversation message. */
export const messageRoleSchema = z.enum(["user", "assistant"]);

export type MessageRole = z.output<typeof messageRoleSchema>;
