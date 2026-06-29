import { z } from "@brains/utils/zod-v4";
import {
  baseEntityParserSchema,
  baseEntitySchema,
  anchorProfileBodySchema,
} from "@brains/plugins";
import { z as z4 } from "@brains/utils/zod-v4";
import { AGENT_ENTITY_TYPE } from "../lib/constants";

/**
 * Shared parser sub-schema — used by body/template parsing.
 */
export const agentSkillSchema = z4.object({
  name: z4.string(),
  description: z4.string(),
  tags: z4.array(z4.string()),
});

export type AgentSkill = z4.output<typeof agentSkillSchema>;

export const agentStatusSchema = z
  .enum(["discovered", "approved"])
  .describe("Discovered for review or approved for calling");

export type AgentStatus = z.infer<typeof agentStatusSchema>;

const agentStatusParserSchema = z4
  .enum(["discovered", "approved"])
  .describe("Discovered for review or approved for calling");

/**
 * Agent frontmatter schema — structured data in YAML frontmatter.
 * Anchor fields (name, kind, organization) come from anchorProfileBodySchema.
 * Skills live in the body as markdown sections to keep frontmatter short.
 */
export const agentFrontmatterSchema = anchorProfileBodySchema
  .pick({ name: true, kind: true, organization: true })
  .extend({
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

/**
 * Agent metadata schema — subset of frontmatter for DB queries.
 */
export const agentMetadataSchema = agentFrontmatterSchema
  .pick({
    name: true,
    url: true,
    status: true,
  })
  .extend({
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

const agentFrontmatterParserSchema = z4.object({
  name: z4.string(),
  kind: z4.enum(["professional", "team", "collective"]),
  organization: z4.string().optional(),
  brainName: z4.string(),
  url: z4.url(),
  did: z4.string().optional(),
  repoDid: z4.string().optional(),
  brainDid: z4.string().optional(),
  anchorDid: z4.string().optional(),
  cardUri: z4.string().optional(),
  cardCid: z4.string().optional(),
  a2aEndpoint: z4.url().optional(),
  status: agentStatusParserSchema,
  discoveredAt: z4.string().datetime(),
});

const agentMetadataParserSchema = z4.object({
  name: z4.string(),
  url: z4.url(),
  status: agentStatusParserSchema,
  discoveredAt: z4.string().datetime().optional(),
  slug: z4.string(),
  repoDid: z4.string().optional(),
  brainDid: z4.string().optional(),
  anchorDid: z4.string().optional(),
  cardUri: z4.string().optional(),
  cardCid: z4.string().optional(),
  a2aEndpoint: z4.url().optional(),
});

/**
 * Agent entity schema
 */
export const agentEntitySchema = baseEntitySchema.extend({
  entityType: z.literal(AGENT_ENTITY_TYPE),
  metadata: agentMetadataSchema,
});

export type AgentEntity = z.infer<typeof agentEntitySchema>;

/**
 * Agent with parsed frontmatter and body sections.
 * Used by the datasource to pass structured data to templates.
 */
const agentEntityParserSchema = baseEntityParserSchema.extend({
  entityType: z4.literal(AGENT_ENTITY_TYPE),
  metadata: agentMetadataParserSchema,
});

export const agentWithDataSchema = agentEntityParserSchema.extend({
  frontmatter: agentFrontmatterParserSchema,
  about: z4.string(),
  skills: z4.array(agentSkillSchema),
  notes: z4.string(),
});

export type AgentWithData = z4.output<typeof agentWithDataSchema>;

/**
 * Enriched agent schema — includes URL and display fields added by site-builder.
 */
export const enrichedAgentSchema = agentWithDataSchema.extend({
  url: z4.string().optional(),
  typeLabel: z4.string().optional(),
});

/**
 * Template agent schema — all enrichment fields are required.
 */
export const templateAgentSchema = agentWithDataSchema.extend({
  url: z4.string(),
  typeLabel: z4.string(),
});

export type EnrichedAgent = z4.output<typeof enrichedAgentSchema>;
export type TemplateAgent = z4.output<typeof templateAgentSchema>;
