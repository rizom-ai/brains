import {
  memoryActorReferenceParserSchema,
  memoryActorReferenceSchema,
  type ActionItemEntity,
} from "@brains/action-items";
import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { summaryTimeRangeSchema } from "./summary";

type DecisionMetadataSchema = z.ZodObject<{
  conversationId: z.ZodString;
  channelId: z.ZodString;
  channelName: z.ZodOptional<z.ZodString>;
  interfaceType: z.ZodString;
  spaceId: z.ZodString;
  timeRange: typeof summaryTimeRangeSchema;
  sourceSummaryId: z.ZodString;
  sourceMessageCount: z.ZodNumber;
  projectionVersion: z.ZodNumber;
  status: z.ZodEnum<{ active: "active"; superseded: "superseded" }>;
  decidedBy: z.ZodOptional<z.ZodArray<typeof memoryActorReferenceSchema>>;
  mentionedBy: z.ZodOptional<z.ZodArray<typeof memoryActorReferenceSchema>>;
}>;

export const decisionMetadataSchema: DecisionMetadataSchema = z.object({
  conversationId: z.string(),
  channelId: z.string(),
  channelName: z.string().optional(),
  interfaceType: z.string(),
  spaceId: z.string(),
  timeRange: summaryTimeRangeSchema,
  sourceSummaryId: z.string(),
  sourceMessageCount: z.number().int().min(0),
  projectionVersion: z.number().int().min(1),
  status: z.enum(["active", "superseded"]),
  decidedBy: z.array(memoryActorReferenceSchema).optional(),
  mentionedBy: z.array(memoryActorReferenceSchema).optional(),
});

const decisionEntityMetadataParserSchema: z.ZodObject<
  Omit<DecisionMetadataSchema["shape"], "decidedBy" | "mentionedBy"> & {
    decidedBy: z.ZodOptional<
      z.ZodArray<typeof memoryActorReferenceParserSchema>
    >;
    mentionedBy: z.ZodOptional<
      z.ZodArray<typeof memoryActorReferenceParserSchema>
    >;
  }
> = z.object({
  conversationId: z.string(),
  channelId: z.string(),
  channelName: z.string().optional(),
  interfaceType: z.string(),
  spaceId: z.string(),
  timeRange: summaryTimeRangeSchema,
  sourceSummaryId: z.string(),
  sourceMessageCount: z.number().int().min(0),
  projectionVersion: z.number().int().min(1),
  status: z.enum(["active", "superseded"]),
  decidedBy: z.array(memoryActorReferenceParserSchema).optional(),
  mentionedBy: z.array(memoryActorReferenceParserSchema).optional(),
});

/** Decision entity metadata, as parsed from stored (possibly legacy) records. */
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
