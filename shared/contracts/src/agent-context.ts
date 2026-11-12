import { z } from "@brains/utils/zod";
import { defineBusContract, type BusContract } from "./bus-contract";

type AgentContextPermissionLevelSchema = z.ZodEnum<{
  admin: "admin";
  trusted: "trusted";
  public: "public";
}>;

export const agentContextPermissionLevelSchema: AgentContextPermissionLevelSchema =
  z.enum(["admin", "trusted", "public"]);

export type AgentContextPermissionLevel = z.output<
  typeof agentContextPermissionLevelSchema
>;

type AgentContextRequestSchema = z.ZodObject<{
  conversationId: z.ZodString;
  message: z.ZodString;
  interfaceType: z.ZodString;
  channelId: z.ZodOptional<z.ZodString>;
  channelName: z.ZodOptional<z.ZodString>;
  userPermissionLevel: AgentContextPermissionLevelSchema;
}>;

export const agentContextRequestSchema: AgentContextRequestSchema = z.object({
  conversationId: z.string().min(1),
  message: z.string(),
  interfaceType: z.string().min(1),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  userPermissionLevel: agentContextPermissionLevelSchema,
});

export type AgentContextRequest = z.output<typeof agentContextRequestSchema>;

type AgentContextItemSchema = z.ZodObject<{
  id: z.ZodString;
  source: z.ZodString;
  title: z.ZodOptional<z.ZodString>;
  content: z.ZodString;
  provenance: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}>;

export const agentContextItemSchema: AgentContextItemSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  title: z.string().optional(),
  content: z.string().min(1),
  provenance: z.record(z.string(), z.unknown()).optional(),
});

export type AgentContextItem = z.output<typeof agentContextItemSchema>;

type AgentContextResponseSchema = z.ZodObject<{
  items: z.ZodDefault<z.ZodArray<AgentContextItemSchema>>;
}>;

export const agentContextResponseSchema: AgentContextResponseSchema = z.object({
  items: z.array(agentContextItemSchema).default([]),
});

export type AgentContextResponse = z.output<typeof agentContextResponseSchema>;
export type AgentContextResponseInput = z.input<
  typeof agentContextResponseSchema
>;

type AgentContextAnswerSchema = z.ZodObject<{
  items: z.ZodPipe<
    z.ZodDefault<z.ZodArray<z.ZodUnknown>>,
    z.ZodTransform<AgentContextItem[], unknown[]>
  >;
}>;

/**
 * A provider's answer, read leniently: an item that fails validation (an
 * empty excerpt failing `content.min(1)`, say) is dropped, and never costs
 * the turn the rest of the provider's retrieved memory.
 */
export const agentContextAnswerSchema: AgentContextAnswerSchema = z.object({
  items: z
    .array(z.unknown())
    .default([])
    .transform((items) =>
      items.flatMap((item) => {
        const parsed = agentContextItemSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      }),
    ),
});

/** Gather context for an agent turn from every plugin that keeps some. */
export const agentContextContract: BusContract<
  AgentContextRequestSchema,
  AgentContextAnswerSchema,
  "collect"
> = defineBusContract({
  channel: "agent:context:request",
  request: agentContextRequestSchema,
  response: agentContextAnswerSchema,
  delivery: "collect",
});
