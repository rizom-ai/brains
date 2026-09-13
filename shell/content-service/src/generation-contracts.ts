import { jsonObjectSchema, type JsonObject } from "@brains/contracts";
import {
  canonicalContentVisibilitySchema,
  encodeEntityIdPath,
  entityIdPathSchema,
  type EntityIdPath,
  type EntityIdPathInput,
  type ContentVisibility,
} from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import {
  assertGenerationJsonLimits,
  assertGenerationRequestLimits,
  generationLimitPreprocessor,
} from "./generation-limits";
import {
  generationAuthoritySchema,
  type GenerationAuthority,
  type GenerationCaller,
} from "./generation-authorization";
import {
  generationContextSchema,
  type GenerationContext,
} from "./generation-context";

export interface DurableGenerationContext extends Omit<
  GenerationContext,
  "data"
> {
  data?: JsonObject | undefined;
}

export interface ContentGenerationDestination {
  entityType: string;
  idPath: EntityIdPath;
  metadata: JsonObject;
  visibility?: ContentVisibility | undefined;
}

export interface ContentGenerationDestinationInput {
  entityType: string;
  idPath: EntityIdPathInput;
  metadata: JsonObject;
  visibility?: ContentVisibility | undefined;
}

export interface ContentGenerationTarget {
  templateName: string;
  context: DurableGenerationContext;
  destination: ContentGenerationDestination;
}

export interface ContentGenerationTargetInput {
  templateName: string;
  context?: DurableGenerationContext;
  destination: ContentGenerationDestinationInput;
}

export interface ContentGenerationOptions {
  dryRun?: boolean;
  force?: boolean;
}

export interface ParsedContentGenerationOptions {
  dryRun: boolean;
  force: boolean;
}

export interface ContentGenerationRequestInput {
  caller: GenerationCaller;
  targets: ContentGenerationTargetInput[];
  options?: ContentGenerationOptions;
  /** Template names are local to this plugin and scoped by the runtime. */
  pluginId?: string;
}

interface ParsedContentGenerationRequest {
  targets: ContentGenerationTarget[];
  options: ParsedContentGenerationOptions;
}

export interface PersistedContentGenerationDestination {
  entityType: string;
  entityId: string;
  metadata: JsonObject;
  visibility: ContentVisibility;
}

export interface ContentGenerationJobData {
  authority: GenerationAuthority;
  operationId: string;
  templateName: string;
  context: DurableGenerationContext;
  destination: PersistedContentGenerationDestination;
  expectedRevision: string | null;
}

export const durableGenerationContextSchema: z.ZodType<
  DurableGenerationContext,
  unknown
> = generationContextSchema.extend({
  data: jsonObjectSchema.optional(),
});

export const contentGenerationDestinationSchema: z.ZodType<
  ContentGenerationDestination,
  unknown
> = z.object({
  entityType: z.string().min(1),
  idPath: entityIdPathSchema,
  metadata: jsonObjectSchema,
  visibility: canonicalContentVisibilitySchema.optional(),
});

export const contentGenerationTargetSchema: z.ZodType<
  ContentGenerationTarget,
  unknown
> = z.object({
  templateName: z.string().min(1),
  context: durableGenerationContextSchema.default(() => ({})),
  destination: contentGenerationDestinationSchema,
});

export const contentGenerationOptionsSchema: z.ZodType<
  ParsedContentGenerationOptions,
  unknown
> = z.object({
  dryRun: z.boolean().optional().default(false),
  force: z.boolean().optional().default(false),
});

/** Owns the admission limits: the preprocessor rejects oversized or cyclic input before Zod recurses. */
export const contentGenerationRequestSchema: z.ZodType<
  ParsedContentGenerationRequest,
  unknown
> = z.preprocess(
  generationLimitPreprocessor(assertGenerationRequestLimits),
  z.object({
    targets: z.array(contentGenerationTargetSchema),
    options: contentGenerationOptionsSchema.default(() => ({
      dryRun: false,
      force: false,
    })),
  }),
);

export const persistedContentGenerationDestinationSchema: z.ZodType<
  PersistedContentGenerationDestination,
  unknown
> = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  metadata: jsonObjectSchema,
  visibility: canonicalContentVisibilitySchema,
});

/** Owns the durable payload limits for every job the worker accepts. */
export const contentGenerationJobDataSchema: z.ZodType<
  ContentGenerationJobData,
  unknown
> = z.preprocess(
  generationLimitPreprocessor(assertGenerationJsonLimits),
  z.object({
    authority: generationAuthoritySchema,
    operationId: z.string().min(1),
    templateName: z.string().min(1, "Template name is required"),
    context: durableGenerationContextSchema,
    destination: persistedContentGenerationDestinationSchema,
    expectedRevision: z.string().min(1).nullable(),
  }),
);

export const contentGenerationSkipReasons = [
  "content-exists",
  "template-not-found",
  "template-cannot-generate",
] as const;
export type ContentGenerationSkipReason =
  (typeof contentGenerationSkipReasons)[number];

/** `index` is the target's position in the request, so results keep its order. */
export interface PlannedContentGeneration {
  readonly index: number;
  readonly target: ContentGenerationTarget;
  readonly entityId: string;
  readonly jobData: ContentGenerationJobData;
}

export interface SkippedContentGeneration {
  readonly index: number;
  readonly target: ContentGenerationTarget;
  readonly entityId: string;
  readonly reason: ContentGenerationSkipReason;
}

export interface ContentGenerationPlan {
  readonly planned: readonly PlannedContentGeneration[];
  readonly skipped: readonly SkippedContentGeneration[];
  readonly totalTargets: number;
}

export type ContentGenerationItemStatus = "planned" | "queued" | "skipped";

interface ContentGenerationItemBase {
  readonly destination: {
    readonly entityType: string;
    readonly idPath: EntityIdPath;
    readonly entityId: string;
  };
  readonly templateName: string;
}

/** One admission decision per requested target, in request order. */
export type ContentGenerationItemResult =
  | (ContentGenerationItemBase & { readonly status: "planned" })
  | (ContentGenerationItemBase & {
      readonly status: "queued";
      readonly jobId: string;
    })
  | (ContentGenerationItemBase & {
      readonly status: "skipped";
      readonly reason: ContentGenerationSkipReason;
    });

export interface ContentGenerationBatchResult {
  readonly items: readonly ContentGenerationItemResult[];
  readonly totalTargets: number;
  readonly plannedTargets: number;
  readonly queuedTargets: number;
  readonly skippedTargets: number;
  readonly batchId?: string;
}

/** The single notion of "same destination", for duplicate checks and messages. */
export function destinationKey(destination: {
  entityType: string;
  idPath: EntityIdPathInput;
}): string {
  return `${destination.entityType}/${encodeEntityIdPath(destination.idPath)}`;
}
