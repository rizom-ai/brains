import { z } from "@brains/utils/zod";
import { baseEntityParserSchema } from "@brains/plugins";

export interface SummaryTimeRange {
  start: string;
  end: string;
}

export const summaryTimeRangeSchema: z.ZodType<SummaryTimeRange> = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

const summaryTimeRangeParserSchema: z.ZodType<SummaryTimeRange> = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export interface SummaryEntry {
  title: string;
  summary: string;
  timeRange: SummaryTimeRange;
  sourceMessageCount: number;
  keyPoints: string[];
}

export const summaryEntrySchema: z.ZodType<SummaryEntry> = z.object({
  title: z.string().min(1).describe("Brief topic or phase title"),
  summary: z.string().min(1).describe("Grounded prose summary"),
  timeRange: summaryTimeRangeParserSchema,
  sourceMessageCount: z.number().int().min(0),
  keyPoints: z.array(z.string()),
});

export interface SummaryBody {
  entries: SummaryEntry[];
}

export const summaryBodySchema: z.ZodType<SummaryBody> = z.object({
  entries: z.array(summaryEntrySchema),
});

export interface SummaryParticipant {
  actorId: string;
  canonicalId?: string | undefined;
  displayName?: string | undefined;
  roles: Array<"user" | "assistant" | "system">;
  sourceActorIds?: string[] | undefined;
}

export const summaryParticipantSchema: z.ZodType<SummaryParticipant> = z.object(
  {
    actorId: z.string(),
    canonicalId: z.string().optional(),
    displayName: z.string().optional(),
    roles: z.array(z.enum(["user", "assistant", "system"])).min(1),
    sourceActorIds: z.array(z.string()).optional(),
  },
);

export interface SummaryMetadata {
  [key: string]: unknown;
  conversationId: string;
  channelId: string;
  channelName?: string | undefined;
  interfaceType: string;
  timeRange?: SummaryTimeRange | undefined;
  messageCount: number;
  entryCount: number;
  participants?: SummaryParticipant[] | undefined;
  sourceHash: string;
  projectionVersion: number;
}

type SummaryMetadataSchema = z.ZodObject<{
  conversationId: z.ZodString;
  channelId: z.ZodString;
  channelName: z.ZodOptional<z.ZodString>;
  interfaceType: z.ZodString;
  timeRange: z.ZodOptional<z.ZodType<SummaryTimeRange>>;
  messageCount: z.ZodNumber;
  entryCount: z.ZodNumber;
  participants: z.ZodOptional<z.ZodArray<z.ZodType<SummaryParticipant>>>;
  sourceHash: z.ZodString;
  projectionVersion: z.ZodNumber;
}>;

export const summaryMetadataSchema: SummaryMetadataSchema = z.object({
  conversationId: z.string(),
  channelId: z.string(),
  channelName: z.string().optional(),
  interfaceType: z.string(),
  timeRange: summaryTimeRangeSchema.optional(),
  messageCount: z.number().int().min(0),
  entryCount: z.number().int().min(0),
  participants: z.array(summaryParticipantSchema).optional(),
  sourceHash: z.string(),
  projectionVersion: z.number().int().min(1),
});

const summaryParticipantParserSchema: z.ZodType<SummaryParticipant> = z.object({
  actorId: z.string(),
  canonicalId: z.string().optional(),
  displayName: z.string().optional(),
  roles: z.array(z.enum(["user", "assistant", "system"])).min(1),
  sourceActorIds: z.array(z.string()).optional(),
});

const summaryEntityMetadataParserSchema: z.ZodType<SummaryMetadata> = z.object({
  conversationId: z.string(),
  channelId: z.string(),
  channelName: z.string().optional(),
  interfaceType: z.string(),
  timeRange: summaryTimeRangeParserSchema.optional(),
  messageCount: z.number().int().min(0),
  entryCount: z.number().int().min(0),
  participants: z.array(summaryParticipantParserSchema).optional(),
  sourceHash: z.string(),
  projectionVersion: z.number().int().min(1),
});

export const summarySchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"summary">;
    metadata: z.ZodType<SummaryMetadata>;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("summary"),
  metadata: summaryEntityMetadataParserSchema,
});

export type SummaryEntity = z.output<typeof summarySchema>;
