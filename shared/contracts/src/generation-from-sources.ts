import { z } from "@brains/utils/zod";
import { actorRefSchema } from "./actor-ref";
import { defineBusContract, type BusContract } from "./bus-contract";

/** The approval a confirmation hands out, sent back unchanged to run it. */
const approvalSchema: z.ZodRecord<z.ZodString, z.ZodUnknown> = z.record(
  z.string(),
  z.unknown(),
);

type GenerateFromSourcesRequestSchema = z.ZodObject<{
  entityType: z.ZodString;
  source: z.ZodObject<{
    entityType: z.ZodString;
    entityIds: z.ZodArray<z.ZodString>;
  }>;
  prompt: z.ZodOptional<z.ZodString>;
  approval: z.ZodOptional<typeof approvalSchema>;
  actor: typeof actorRefSchema;
  interfaceType: z.ZodString;
  userPermissionLevel: z.ZodEnum<{
    admin: "admin";
    trusted: "trusted";
    public: "public";
  }>;
}>;

/**
 * One entity generated from one or more existing entries of one type, for
 * the caller the request names: who they are, where they ask from and the
 * level they hold. Without `approval` it asks; with the approval a
 * confirmation handed out, it runs.
 */
export const generateFromSourcesRequestSchema: GenerateFromSourcesRequestSchema =
  z.object({
    entityType: z.string().min(1),
    source: z.object({
      entityType: z.string().min(1),
      entityIds: z.array(z.string().min(1)).min(1).max(51),
    }),
    /** What the writing should focus on; omitted, it is written from the sources alone. */
    prompt: z.string().trim().min(1).max(2_000).optional(),
    approval: approvalSchema.optional(),
    actor: actorRefSchema,
    interfaceType: z.string().min(1),
    userPermissionLevel: z.enum(["admin", "trusted", "public"]),
  });

type GenerateFromSourcesResponseSchema = z.ZodDiscriminatedUnion<
  [
    z.ZodObject<{
      status: z.ZodLiteral<"confirm">;
      summary: z.ZodString;
      completionSummary: z.ZodOptional<z.ZodString>;
      preview: z.ZodString;
      approval: typeof approvalSchema;
    }>,
    z.ZodObject<{
      status: z.ZodLiteral<"queued">;
      entityId: z.ZodString;
      jobId: z.ZodOptional<z.ZodString>;
    }>,
    z.ZodObject<{
      status: z.ZodLiteral<"refused">;
      error: z.ZodString;
      code: z.ZodOptional<z.ZodString>;
    }>,
  ],
  "status"
>;

/**
 * What `system_generate` answered: the confirmation to put to the caller,
 * the placeholder its queued generation fills, or why it refused.
 */
export const generateFromSourcesResponseSchema: GenerateFromSourcesResponseSchema =
  z.discriminatedUnion("status", [
    z.object({
      status: z.literal("confirm"),
      summary: z.string(),
      completionSummary: z.string().optional(),
      preview: z.string(),
      approval: approvalSchema,
    }),
    z.object({
      status: z.literal("queued"),
      entityId: z.string(),
      jobId: z.string().optional(),
    }),
    z.object({
      status: z.literal("refused"),
      error: z.string(),
      code: z.string().optional(),
    }),
  ]);

export type GenerateFromSourcesRequest = z.output<
  typeof generateFromSourcesRequestSchema
>;
export type GenerateFromSourcesResponse = z.output<
  typeof generateFromSourcesResponseSchema
>;

/**
 * A package without the agent's tools, such as Studio, asks for a
 * generation written from existing entries. The system answers it with
 * `system_generate` itself, as the caller the request names, so its
 * refusals, its confirmation and its queued job are the tool's own.
 */
export const generateFromSourcesContract: BusContract<
  GenerateFromSourcesRequestSchema,
  GenerateFromSourcesResponseSchema,
  "request"
> = defineBusContract({
  channel: "generate:from-sources",
  request: generateFromSourcesRequestSchema,
  response: generateFromSourcesResponseSchema,
  delivery: "request",
});
