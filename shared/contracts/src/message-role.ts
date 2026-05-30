import { z } from "zod";

/** Canonical role of a stored conversation message. */
export const messageRoleSchema = z.enum(["user", "assistant"]);

export type MessageRole = z.infer<typeof messageRoleSchema>;
