import { z } from "@brains/utils/zod";
import { DaemonStatusInfoSchema } from "../manager/daemon-types";

const userPermissionLevelSchema: z.ZodEnum<{
  admin: "admin";
  trusted: "trusted";
  public: "public";
}> = z.enum(["admin", "trusted", "public"]);

export const endpointInfoSchema: z.ZodObject<{
  label: z.ZodString;
  url: z.ZodString;
  pluginId: z.ZodString;
  priority: z.ZodDefault<z.ZodNumber>;
  visibility: z.ZodDefault<typeof userPermissionLevelSchema>;
  requiresActiveSession: z.ZodOptional<z.ZodBoolean>;
}> = z.object({
  label: z.string(),
  url: z.string(),
  pluginId: z.string(),
  priority: z.number().default(100),
  visibility: userPermissionLevelSchema.default("public"),
  requiresActiveSession: z.boolean().optional(),
});

export type EndpointInfo = z.output<typeof endpointInfoSchema>;
export type EndpointInfoInput = z.input<typeof endpointInfoSchema>;

export const interactionKindSchema: z.ZodEnum<{
  human: "human";
  agent: "agent";
  admin: "admin";
  protocol: "protocol";
}> = z.enum(["human", "agent", "admin", "protocol"]);

export const interactionStatusSchema: z.ZodEnum<{
  available: "available";
  "coming-soon": "coming-soon";
  disabled: "disabled";
}> = z.enum(["available", "coming-soon", "disabled"]);

export const interactionInfoSchema: z.ZodObject<{
  id: z.ZodString;
  label: z.ZodString;
  description: z.ZodOptional<z.ZodString>;
  href: z.ZodString;
  kind: typeof interactionKindSchema;
  pluginId: z.ZodString;
  priority: z.ZodDefault<z.ZodNumber>;
  visibility: z.ZodDefault<typeof userPermissionLevelSchema>;
  requiresActiveSession: z.ZodOptional<z.ZodBoolean>;
  status: z.ZodDefault<typeof interactionStatusSchema>;
}> = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  href: z.string(),
  kind: interactionKindSchema,
  pluginId: z.string(),
  priority: z.number().default(100),
  visibility: userPermissionLevelSchema.default("public"),
  requiresActiveSession: z.boolean().optional(),
  status: interactionStatusSchema.default("available"),
});

export type InteractionInfo = z.output<typeof interactionInfoSchema>;
export type InteractionInfoInput = z.input<typeof interactionInfoSchema>;

export const entityCountSchema: z.ZodObject<{
  entityType: z.ZodString;
  count: z.ZodNumber;
}> = z.object({
  entityType: z.string(),
  count: z.number(),
});

export type EntityCount = z.output<typeof entityCountSchema>;

export const backgroundWorkInfoSchema: z.ZodObject<{
  status: z.ZodEnum<{ operational: "operational"; degraded: "degraded" }>;
  reasons: z.ZodArray<z.ZodString>;
  worker: z.ZodObject<{
    state: z.ZodEnum<{ active: "active"; missing: "missing"; stale: "stale" }>;
    activeSessions: z.ZodNumber;
    staleSessions: z.ZodNumber;
    latestHeartbeatAgeMs: z.ZodNullable<z.ZodNumber>;
  }>;
  queue: z.ZodObject<{
    duePending: z.ZodNumber;
    processing: z.ZodNumber;
    oldestDuePendingAgeMs: z.ZodNullable<z.ZodNumber>;
    latestClaimAgeMs: z.ZodNullable<z.ZodNumber>;
    stalled: z.ZodBoolean;
  }>;
}> = z.object({
  status: z.enum(["operational", "degraded"]),
  reasons: z.array(z.string()),
  worker: z.object({
    state: z.enum(["active", "missing", "stale"]),
    activeSessions: z.number().int().nonnegative(),
    staleSessions: z.number().int().nonnegative(),
    latestHeartbeatAgeMs: z.number().nonnegative().nullable(),
  }),
  queue: z.object({
    duePending: z.number().int().nonnegative(),
    processing: z.number().int().nonnegative(),
    oldestDuePendingAgeMs: z.number().nonnegative().nullable(),
    latestClaimAgeMs: z.number().nonnegative().nullable(),
    stalled: z.boolean(),
  }),
});

export type BackgroundWorkInfo = z.output<typeof backgroundWorkInfoSchema>;

export const appInfoSchema: z.ZodObject<{
  model: z.ZodString;
  version: z.ZodString;
  uptime: z.ZodNumber;
  entities: z.ZodNumber;
  entityCounts: z.ZodArray<typeof entityCountSchema>;
  embeddings: z.ZodNumber;
  backgroundWork: typeof backgroundWorkInfoSchema;
  ai: z.ZodObject<{
    model: z.ZodString;
    embeddingModel: z.ZodString;
  }>;
  daemons: z.ZodArray<typeof DaemonStatusInfoSchema>;
  endpoints: z.ZodArray<typeof endpointInfoSchema>;
  interactions: z.ZodArray<typeof interactionInfoSchema>;
}> = z.object({
  model: z.string(),
  version: z.string(),
  uptime: z.number(),
  entities: z.number(),
  entityCounts: z.array(entityCountSchema),
  embeddings: z.number(),
  backgroundWork: backgroundWorkInfoSchema,
  ai: z.object({
    model: z.string(),
    embeddingModel: z.string(),
  }),
  daemons: z.array(DaemonStatusInfoSchema),
  endpoints: z.array(endpointInfoSchema),
  interactions: z.array(interactionInfoSchema),
});

export type RuntimeAppInfo = z.output<typeof appInfoSchema>;
