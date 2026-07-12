import { z } from "@brains/utils/zod";
import {
  endpointInfoSchema,
  entityCountSchema,
  interactionInfoSchema,
} from "../interfaces";

// Public daemon health uses a stringified lastCheck (Date → ISO string);
// the runtime variant in manager/daemon-types.ts uses z.date().
const DaemonHealthSchema: z.ZodObject<{
  status: z.ZodEnum<{
    healthy: "healthy";
    warning: "warning";
    error: "error";
    unknown: "unknown";
  }>;
  message: z.ZodOptional<z.ZodString>;
  lastCheck: z.ZodOptional<z.ZodString>;
  details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}> = z.object({
  status: z.enum(["healthy", "warning", "error", "unknown"]),
  message: z.string().optional(),
  lastCheck: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

const DaemonStatusSchema: z.ZodObject<{
  name: z.ZodString;
  pluginId: z.ZodString;
  status: z.ZodString;
  health: z.ZodOptional<typeof DaemonHealthSchema>;
}> = z.object({
  name: z.string(),
  pluginId: z.string(),
  status: z.string(),
  health: DaemonHealthSchema.optional(),
});

export const AppInfoSchema: z.ZodObject<{
  model: z.ZodString;
  version: z.ZodString;
  uptime: z.ZodNumber;
  entities: z.ZodNumber;
  entityCounts: z.ZodArray<typeof entityCountSchema>;
  embeddings: z.ZodNumber;
  ai: z.ZodObject<{
    model: z.ZodString;
    embeddingModel: z.ZodString;
  }>;
  daemons: z.ZodArray<typeof DaemonStatusSchema>;
  endpoints: z.ZodArray<typeof endpointInfoSchema>;
  interactions: z.ZodArray<typeof interactionInfoSchema>;
}> = z.object({
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

export type AppInfo = z.output<typeof AppInfoSchema>;
