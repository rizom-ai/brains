import { z } from "@brains/utils";
import { baseEntitySchema, anchorProfileBodySchema } from "@brains/plugins";

/**
 * Shared sub-schemas — used by frontmatter, adapter, and Agent Card parsing.
 */
export const agentSkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
});

export type AgentSkill = z.infer<typeof agentSkillSchema>;

export const agentStatusSchema = z
  .enum(["discovered", "approved"])
  .describe("Discovered for review or approved for calling");

export type AgentStatus = z.infer<typeof agentStatusSchema>;

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
    slug: z.string(),
  });

export type AgentMetadata = z.infer<typeof agentMetadataSchema>;

/**
 * Agent entity schema
 */
export const agentEntitySchema = baseEntitySchema.extend({
  entityType: z.literal("agent"),
  metadata: agentMetadataSchema,
});

export type AgentEntity = z.infer<typeof agentEntitySchema>;

/**
 * Agent with parsed frontmatter and body sections.
 * Used by the datasource to pass structured data to templates.
 */
export const agentWithDataSchema = agentEntitySchema.extend({
  frontmatter: agentFrontmatterSchema,
  about: z.string(),
  skills: z.array(agentSkillSchema),
  notes: z.string(),
});

export type AgentWithData = z.infer<typeof agentWithDataSchema>;

/**
 * Enriched agent schema — includes URL and display fields added by site-builder.
 */
export const enrichedAgentSchema = agentWithDataSchema.extend({
  url: z.string().optional(),
  typeLabel: z.string().optional(),
});

/**
 * Template agent schema — all enrichment fields are required.
 */
export const templateAgentSchema = agentWithDataSchema.extend({
  url: z.string(),
  typeLabel: z.string(),
});

export type EnrichedAgent = z.infer<typeof enrichedAgentSchema>;
export type TemplateAgent = z.infer<typeof templateAgentSchema>;
