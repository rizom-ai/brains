import { z } from "zod";
import {
  endpointInfoSchema,
  entityCountSchema,
  interactionInfoSchema,
} from "../interfaces";

// Public daemon health uses a stringified lastCheck (Date → ISO string);
// the runtime variant in manager/daemon-types.ts uses z.date().
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
  entityCounts: z.array(entityCountSchema),
  embeddings: z.number(),
  ai: z.object({
    model: z.string(),
    embeddingModel: z.string(),
  }),
  daemons: z.array(DaemonStatusSchema),
  endpoints: z.array(endpointInfoSchema),
  interactions: z.array(interactionInfoSchema),
});

export type AppInfo = z.infer<typeof AppInfoSchema>;
