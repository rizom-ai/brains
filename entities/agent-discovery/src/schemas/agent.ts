import { z } from "@brains/utils/zod-v4";
import { baseEntityParserSchema, baseEntitySchema } from "@brains/plugins";
import { AGENT_ENTITY_TYPE } from "../lib/constants";

/**
 * Shared parser sub-schema — used by body/template parsing.
 */
type AgentSkillSchema = z.ZodObject<{
  name: z.ZodString;
  description: z.ZodString;
  tags: z.ZodArray<z.ZodString>;
}>;

export const agentSkillSchema: AgentSkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
});

export type AgentSkill = z.output<typeof agentSkillSchema>;

type AgentStatusSchema = z.ZodEnum<{
  discovered: "discovered";
  approved: "approved";
}>;

export const agentStatusSchema: AgentStatusSchema = z
  .enum(["discovered", "approved"])
  .describe("Discovered for review or approved for calling");

export type AgentStatus = z.infer<typeof agentStatusSchema>;

const agentStatusParserSchema: AgentStatusSchema = z
  .enum(["discovered", "approved"])
  .describe("Discovered for review or approved for calling");

type AgentKindSchema = z.ZodEnum<{
  professional: "professional";
  team: "team";
  collective: "collective";
}>;

const agentKindSchema: AgentKindSchema = z.enum([
  "professional",
  "team",
  "collective",
]);

export type AgentFrontmatterSchema = z.ZodObject<{
  name: z.ZodString;
  kind: AgentKindSchema;
  organization: z.ZodOptional<z.ZodString>;
  brainName: z.ZodString;
  url: z.ZodString;
  did: z.ZodOptional<z.ZodString>;
  repoDid: z.ZodOptional<z.ZodString>;
  brainDid: z.ZodOptional<z.ZodString>;
  anchorDid: z.ZodOptional<z.ZodString>;
  cardUri: z.ZodOptional<z.ZodString>;
  cardCid: z.ZodOptional<z.ZodString>;
  a2aEndpoint: z.ZodOptional<z.ZodString>;
  status: AgentStatusSchema;
  discoveredAt: z.ZodString;
}>;

/**
 * Agent frontmatter schema — structured data in YAML frontmatter.
 * Anchor fields (name, kind, organization) mirror anchorProfileBodySchema.
 * Skills live in the body as markdown sections to keep frontmatter short.
 */
export const agentFrontmatterSchema: AgentFrontmatterSchema = z.object({
  // Anchor fields
  name: z.string(),
  kind: agentKindSchema,
  organization: z.string().optional(),

  // Brain (what)
  brainName: z.string().describe("Name of the brain instance"),
  url: z.string().url().describe("Brain endpoint URL"),
  did: z.string().optional().describe("Decentralized identifier (public)"),
  repoDid: z.string().optional().describe("ATProto repo DID"),
  brainDid: z.string().optional().describe("ATProto brain DID"),
  anchorDid: z.string().optional().describe("ATProto anchor DID"),
  cardUri: z.string().optional().describe("ATProto brain card URI"),
  cardCid: z.string().optional().describe("ATProto brain card CID"),
  a2aEndpoint: z.string().url().optional().describe("A2A endpoint URL"),

  // Relationship
  status: agentStatusSchema,
  discoveredAt: z
    .string()
    .datetime()
    .describe("When this agent was first discovered"),
});

export type AgentFrontmatter = z.infer<typeof agentFrontmatterSchema>;

export type AgentMetadataSchema = z.ZodObject<{
  name: z.ZodString;
  url: z.ZodString;
  status: AgentStatusSchema;
  discoveredAt: z.ZodOptional<z.ZodString>;
  slug: z.ZodString;
  repoDid: z.ZodOptional<z.ZodString>;
  brainDid: z.ZodOptional<z.ZodString>;
  anchorDid: z.ZodOptional<z.ZodString>;
  cardUri: z.ZodOptional<z.ZodString>;
  cardCid: z.ZodOptional<z.ZodString>;
  a2aEndpoint: z.ZodOptional<z.ZodString>;
}>;

/**
 * Agent metadata schema — subset of frontmatter for DB queries.
 */
export const agentMetadataSchema: AgentMetadataSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  status: agentStatusSchema,
  discoveredAt: z.string().datetime().optional(),
  slug: z.string(),
  repoDid: z.string().optional(),
  brainDid: z.string().optional(),
  anchorDid: z.string().optional(),
  cardUri: z.string().optional(),
  cardCid: z.string().optional(),
  a2aEndpoint: z.string().url().optional(),
});

export type AgentMetadata = z.infer<typeof agentMetadataSchema>;

const agentFrontmatterParserSchema: AgentFrontmatterSchema = z.object({
  name: z.string(),
  kind: z.enum(["professional", "team", "collective"]),
  organization: z.string().optional(),
  brainName: z.string(),
  url: z.string().url(),
  did: z.string().optional(),
  repoDid: z.string().optional(),
  brainDid: z.string().optional(),
  anchorDid: z.string().optional(),
  cardUri: z.string().optional(),
  cardCid: z.string().optional(),
  a2aEndpoint: z.string().url().optional(),
  status: agentStatusParserSchema,
  discoveredAt: z.string().datetime(),
});

const agentMetadataParserSchema: AgentMetadataSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  status: agentStatusParserSchema,
  discoveredAt: z.string().datetime().optional(),
  slug: z.string(),
  repoDid: z.string().optional(),
  brainDid: z.string().optional(),
  anchorDid: z.string().optional(),
  cardUri: z.string().optional(),
  cardCid: z.string().optional(),
  a2aEndpoint: z.string().url().optional(),
});

/**
 * Agent entity schema
 */
export const agentEntitySchema: ReturnType<
  typeof baseEntitySchema.extend<{
    entityType: z.ZodLiteral<typeof AGENT_ENTITY_TYPE>;
    metadata: AgentMetadataSchema;
  }>
> = baseEntitySchema.extend({
  entityType: z.literal(AGENT_ENTITY_TYPE),
  metadata: agentMetadataSchema,
});

export type AgentEntity = z.infer<typeof agentEntitySchema>;

/**
 * Agent with parsed frontmatter and body sections.
 * Used by the datasource to pass structured data to templates.
 */
const agentEntityParserSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<typeof AGENT_ENTITY_TYPE>;
    metadata: AgentMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal(AGENT_ENTITY_TYPE),
  metadata: agentMetadataParserSchema,
});

export const agentWithDataSchema: ReturnType<
  typeof agentEntityParserSchema.extend<{
    frontmatter: AgentFrontmatterSchema;
    about: z.ZodString;
    skills: z.ZodArray<AgentSkillSchema>;
    notes: z.ZodString;
  }>
> = agentEntityParserSchema.extend({
  frontmatter: agentFrontmatterParserSchema,
  about: z.string(),
  skills: z.array(agentSkillSchema),
  notes: z.string(),
});

export type AgentWithData = z.output<typeof agentWithDataSchema>;

/**
 * Enriched agent schema — includes URL and display fields added by site-builder.
 */
export const enrichedAgentSchema: ReturnType<
  typeof agentWithDataSchema.extend<{
    url: z.ZodOptional<z.ZodString>;
    typeLabel: z.ZodOptional<z.ZodString>;
  }>
> = agentWithDataSchema.extend({
  url: z.string().optional(),
  typeLabel: z.string().optional(),
});

/**
 * Template agent schema — all enrichment fields are required.
 */
export const templateAgentSchema: ReturnType<
  typeof agentWithDataSchema.extend<{
    url: z.ZodString;
    typeLabel: z.ZodString;
  }>
> = agentWithDataSchema.extend({
  url: z.string(),
  typeLabel: z.string(),
});

export type EnrichedAgent = z.output<typeof enrichedAgentSchema>;
export type TemplateAgent = z.output<typeof templateAgentSchema>;
