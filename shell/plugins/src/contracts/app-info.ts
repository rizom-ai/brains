import { z } from "zod";

const EndpointSchema = z.object({
  label: z.string(),
  url: z.string(),
  pluginId: z.string(),
  priority: z.number(),
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
});

export type AppInfo = z.infer<typeof AppInfoSchema>;
