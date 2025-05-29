import { z } from "zod";

export const InterfaceStateSchema = z.object({
  interfaceId: z.string(),
  userId: z.string(),
  sessionData: z.record(z.unknown()).optional(),
  lastActivity: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type InterfaceState = z.infer<typeof InterfaceStateSchema>;

export const MessageContextSchema = z.object({
  userId: z.string(),
  channelId: z.string(),
  messageId: z.string(),
  threadId: z.string().optional(),
  timestamp: z.date(),
});

export type MessageContext = z.infer<typeof MessageContextSchema>;

export const InterfaceConfigSchema = z.object({
  name: z.string(),
  version: z.string(),
  mcpServerUrl: z.string(),
  database: z.string().optional(),
});

export type InterfaceConfig = z.infer<typeof InterfaceConfigSchema>;
