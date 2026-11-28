import {
  memoryActorReferenceSchema,
  type ActionItemEntity,
} from "@brains/action-items";
import { baseEntityParserSchema } from "@brains/sdk/internal/entity-runtime";
import { z } from "@brains/utils/zod";
import { summaryTimeRangeSchema } from "./summary";

/**
 * What a decision and an insight record about where they came from and
 * whether they still hold. Only one picked up from a conversation states
 * that conversation and the span of its messages; one recorded by hand
 * states the conversation it was said in, or nothing when it was not said in
 * one.
 */
interface MemorySourceFields {
  conversationId: z.ZodOptional<z.ZodString>;
  channelId: z.ZodOptional<z.ZodString>;
  channelName: z.ZodOptional<z.ZodString>;
  interfaceType: z.ZodOptional<z.ZodString>;
  timeRange: z.ZodOptional<typeof summaryTimeRangeSchema>;
  status: z.ZodEnum<{ active: "active"; superseded: "superseded" }>;
  supersededBy: z.ZodOptional<z.ZodString>;
}

/** The fields as a plain shape, which a Zod object's shape must be. */
type MemorySourceShape = {
  [K in keyof MemorySourceFields]: MemorySourceFields[K];
};

type MemoryPeople = z.ZodOptional<
  z.ZodArray<typeof memoryActorReferenceSchema>
>;

/** The source fields as Studio shows them: facts, never the routing ids. */
const memorySourceShape: MemorySourceShape = {
  // Routing ids, unreadable chat-app ids: never shown; channelName is.
  conversationId: z.string().optional().meta({ studioWidget: "hidden" }),
  channelId: z.string().optional().meta({ studioWidget: "hidden" }),
  channelName: z.string().optional().meta({ studioWidget: "provenance" }),
  interfaceType: z.string().optional().meta({ studioWidget: "provenance" }),
  timeRange: summaryTimeRangeSchema
    .optional()
    .meta({ studioWidget: "provenance" }),
  status: z.enum(["active", "superseded"]),
  // The id of what replaced a superseded one, when something did.
  supersededBy: z.string().optional().meta({ studioWidget: "hidden" }),
};

/** The source fields as stored records are parsed. */
const memorySourceParserShape: MemorySourceShape = {
  conversationId: z.string().optional(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  interfaceType: z.string().optional(),
  timeRange: summaryTimeRangeSchema.optional(),
  status: z.enum(["active", "superseded"]),
  supersededBy: z.string().optional(),
};

/** People as Studio shows them, by name. */
function shownPeople(): MemoryPeople {
  return z
    .array(memoryActorReferenceSchema)
    .optional()
    .meta({ studioWidget: "people" });
}

/** What a decision or an insight recorded by hand starts with. */
export const memorySourceSchema: z.ZodObject<MemorySourceShape> = z.object(
  memorySourceParserShape,
);

export type MemorySource = z.output<typeof memorySourceSchema>;

type DecisionMetadataSchema = z.ZodObject<
  MemorySourceShape & { decidedBy: MemoryPeople; mentionedBy: MemoryPeople }
>;

/** Decision fields the projector wrote before the trim; stored decisions may still carry them. */
export const DECISION_RETIRED_FIELDS: readonly string[] = [
  "spaceId",
  "sourceSummaryId",
  "sourceMessageCount",
  "projectionVersion",
];

/** Studio shows where a decision came from as facts, and its people by name. */
export const decisionMetadataSchema: DecisionMetadataSchema = z.object({
  ...memorySourceShape,
  decidedBy: shownPeople(),
  mentionedBy: shownPeople(),
});

const decisionEntityMetadataParserSchema: DecisionMetadataSchema = z.object({
  ...memorySourceParserShape,
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

type InsightMetadataSchema = z.ZodObject<
  MemorySourceShape & { statedBy: MemoryPeople; mentionedBy: MemoryPeople }
>;

/** Studio shows where an insight came from as facts, and its people by name. */
export const insightMetadataSchema: InsightMetadataSchema = z.object({
  ...memorySourceShape,
  statedBy: shownPeople(),
  mentionedBy: shownPeople(),
});

const insightEntityMetadataParserSchema: InsightMetadataSchema = z.object({
  ...memorySourceParserShape,
  statedBy: z.array(memoryActorReferenceSchema).optional(),
  mentionedBy: z.array(memoryActorReferenceSchema).optional(),
});

/** Insight entity metadata, as parsed from stored records. */
export type InsightMetadata = z.output<
  typeof insightEntityMetadataParserSchema
>;

export const insightSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"insight">;
    metadata: typeof insightEntityMetadataParserSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("insight"),
  metadata: insightEntityMetadataParserSchema,
});

export type InsightEntity = z.output<typeof insightSchema>;

export type ConversationMemoryEntity =
  DecisionEntity | InsightEntity | ActionItemEntity;
