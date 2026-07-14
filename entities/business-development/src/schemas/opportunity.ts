import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

export type OpportunityType =
  "commercial" | "grant" | "partnership" | "internal";

export const opportunityTypeSchema: z.ZodType<
  OpportunityType,
  OpportunityType
> = z.enum(["commercial", "grant", "partnership", "internal"]);

export type OpportunityState = "active" | "staged" | "warm" | "closed";

export const opportunityStateSchema: z.ZodType<
  OpportunityState,
  OpportunityState
> = z.enum(["active", "staged", "warm", "closed"]);

export const opportunityScoreSchema: z.ZodNumber = z
  .number()
  .int()
  .min(0)
  .max(5);

const dateStringSchema: z.ZodString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected date in YYYY-MM-DD format");

export interface OpportunityFrontmatter {
  [key: string]: unknown;
  title: string;
  type: OpportunityType;
  state: OpportunityState;
  incomePotential: number;
  organizationalBuild: number;
  brainsDevelopment: number;
  integrity: number;
  owner?: string | undefined;
  hardDeadline?: string | undefined;
  lastActionAt?: string | undefined;
  lastActionBy?: string | undefined;
}

type OpportunityFrontmatterSchema = z.ZodObject<{
  title: z.ZodString;
  type: z.ZodType<OpportunityType, OpportunityType>;
  state: z.ZodType<OpportunityState, OpportunityState>;
  incomePotential: z.ZodNumber;
  organizationalBuild: z.ZodNumber;
  brainsDevelopment: z.ZodNumber;
  integrity: z.ZodNumber;
  owner: z.ZodOptional<z.ZodString>;
  hardDeadline: z.ZodOptional<z.ZodString>;
  lastActionAt: z.ZodOptional<z.ZodString>;
  lastActionBy: z.ZodOptional<z.ZodString>;
}>;

export const opportunityFrontmatterSchema: OpportunityFrontmatterSchema =
  z.object({
    title: z.string().min(1),
    type: opportunityTypeSchema,
    state: opportunityStateSchema,
    incomePotential: opportunityScoreSchema,
    organizationalBuild: opportunityScoreSchema,
    brainsDevelopment: opportunityScoreSchema,
    integrity: opportunityScoreSchema,
    owner: z.string().min(1).optional(),
    hardDeadline: dateStringSchema.optional(),
    lastActionAt: dateStringSchema.optional(),
    lastActionBy: z.string().min(1).optional(),
  });

export interface OpportunityMetadata extends OpportunityFrontmatter {
  slug: string;
}

type OpportunityMetadataSchema = z.ZodObject<{
  title: z.ZodString;
  type: z.ZodType<OpportunityType, OpportunityType>;
  state: z.ZodType<OpportunityState, OpportunityState>;
  incomePotential: z.ZodNumber;
  organizationalBuild: z.ZodNumber;
  brainsDevelopment: z.ZodNumber;
  integrity: z.ZodNumber;
  owner: z.ZodOptional<z.ZodString>;
  hardDeadline: z.ZodOptional<z.ZodString>;
  lastActionAt: z.ZodOptional<z.ZodString>;
  lastActionBy: z.ZodOptional<z.ZodString>;
  slug: z.ZodString;
}>;

export const opportunityMetadataSchema: OpportunityMetadataSchema =
  opportunityFrontmatterSchema.extend({ slug: z.string() });

export const opportunitySchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"opportunity">;
    metadata: OpportunityMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("opportunity"),
  metadata: opportunityMetadataSchema,
});

export type OpportunityEntity = z.output<typeof opportunitySchema>;
export type OpportunityConfig = Record<string, never>;
export type OpportunityConfigInput = Record<string, unknown>;

export const opportunityConfigSchema: z.ZodType<
  OpportunityConfig,
  OpportunityConfigInput
> = z
  .object({})
  .catchall(z.unknown())
  .transform((): OpportunityConfig => ({}));
