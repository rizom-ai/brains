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
}> = z.object({
  label: z.string(),
  url: z.string(),
  pluginId: z.string(),
  priority: z.number().default(100),
  visibility: userPermissionLevelSchema.default("public"),
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

export const appInfoSchema: z.ZodObject<{
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
  ai: z.object({
    model: z.string(),
    embeddingModel: z.string(),
  }),
  daemons: z.array(DaemonStatusInfoSchema),
  endpoints: z.array(endpointInfoSchema),
  interactions: z.array(interactionInfoSchema),
});

export type RuntimeAppInfo = z.output<typeof appInfoSchema>;
