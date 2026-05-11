import { UserPermissionLevelSchema } from "@brains/templates";
import { z } from "zod";

const EndpointSchema = z.object({
  label: z.string(),
  url: z.string(),
  pluginId: z.string(),
  priority: z.number(),
  visibility: UserPermissionLevelSchema.default("public"),
});

const InteractionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  href: z.string(),
  kind: z.enum(["human", "agent", "admin", "protocol"]),
  pluginId: z.string(),
  priority: z.number(),
  visibility: UserPermissionLevelSchema.default("public"),
  status: z.enum(["available", "coming-soon", "disabled"]).default("available"),
});

const DaemonHealthSchema = z.object({
  status: z.enum(["healthy", "warning", "error", "unknown"]),
  message: z.string().optional(),
  lastCheck: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});

const DaemonStatusSchema = z.object({
  name: z.string(),
  pluginId: z.string(),
  status: z.string(),
  health: DaemonHealthSchema.optional(),
});

export const AppInfoSchema = z.object({
  model: z.string(),
  version: z.string(),
  uptime: z.number(),
  entities: z.number(),
  embeddings: z.number(),
  ai: z.object({
    model: z.string(),
    embeddingModel: z.string(),
  }),
  daemons: z.array(DaemonStatusSchema),
  endpoints: z.array(EndpointSchema),
  interactions: z.array(InteractionSchema).optional(),
});

export type AppInfo = z.infer<typeof AppInfoSchema>;
