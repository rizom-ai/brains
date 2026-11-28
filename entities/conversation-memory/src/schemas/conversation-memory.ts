import {
  memoryActorReferenceSchema,
  type ActionItemEntity,
} from "@brains/action-items";
import { baseEntityParserSchema } from "@brains/sdk/internal/entity-runtime";
import { z } from "@brains/utils/zod";
import { summaryTimeRangeSchema } from "./summary";

type DecisionMetadataSchema = z.ZodObject<{
  conversationId: z.ZodOptional<z.ZodString>;
  channelId: z.ZodOptional<z.ZodString>;
  channelName: z.ZodOptional<z.ZodString>;
  interfaceType: z.ZodOptional<z.ZodString>;
  timeRange: z.ZodOptional<typeof summaryTimeRangeSchema>;
  status: z.ZodEnum<{ active: "active"; superseded: "superseded" }>;
  decidedBy: z.ZodOptional<z.ZodArray<typeof memoryActorReferenceSchema>>;
  mentionedBy: z.ZodOptional<z.ZodArray<typeof memoryActorReferenceSchema>>;
}>;

/** Decision fields the projector wrote before the trim; stored decisions may still carry them. */
export const DECISION_RETIRED_FIELDS: readonly string[] = [
  "spaceId",
  "sourceSummaryId",
  "sourceMessageCount",
  "projectionVersion",
];

/**
 * Studio shows where a decision came from as facts, and its people by name.
 * Only a decision picked up from a conversation states that conversation and
 * the span of its messages; one recorded by hand states the channel it was
 * said in, or nothing when it was not said in one.
 */
export const decisionMetadataSchema: DecisionMetadataSchema = z.object({
  // Routing ids, unreadable chat-app ids: never shown; channelName is.
  conversationId: z.string().optional().meta({ studioWidget: "hidden" }),
  channelId: z.string().optional().meta({ studioWidget: "hidden" }),
  channelName: z.string().optional().meta({ studioWidget: "provenance" }),
  interfaceType: z.string().optional().meta({ studioWidget: "provenance" }),
  timeRange: summaryTimeRangeSchema
    .optional()
    .meta({ studioWidget: "provenance" }),
  status: z.enum(["active", "superseded"]),
  decidedBy: z
    .array(memoryActorReferenceSchema)
    .optional()
    .meta({ studioWidget: "people" }),
  mentionedBy: z
    .array(memoryActorReferenceSchema)
    .optional()
    .meta({ studioWidget: "people" }),
});

const decisionEntityMetadataParserSchema: DecisionMetadataSchema = z.object({
  conversationId: z.string().optional(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  interfaceType: z.string().optional(),
  timeRange: summaryTimeRangeSchema.optional(),
  status: z.enum(["active", "superseded"]),
  decidedBy: z.array(memoryActorReferenceSchema).optional(),
  mentionedBy: z.array(memoryActorReferenceSchema).optional(),
});

/** Decision entity metadata, as parsed from stored records. */
export type DecisionMetadata = z.output<
  typeof decisionEntityMetadataParserSchema
>;
export type DecisionStatus = DecisionMetadata["status"];

export const decisionSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"decision">;
    metadata: typeof decisionEntityMetadataParserSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("decision"),
  metadata: decisionEntityMetadataParserSchema,
});

export type DecisionEntity = z.output<typeof decisionSchema>;

export type ConversationMemoryEntity = DecisionEntity | ActionItemEntity;
