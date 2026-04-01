import { z } from "@brains/utils";
import { baseEntitySchema, anchorProfileBodySchema } from "@brains/plugins";

/**
 * Shared sub-schemas — used by frontmatter, adapter, and Agent Card parsing.
 */
export const agentSkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()).default([]),
});

export type AgentSkill = z.infer<typeof agentSkillSchema>;

/**
 * Agent frontmatter schema — structured data in YAML frontmatter.
 * Anchor fields (name, kind, organization) come from anchorProfileBodySchema.
 * Skills live in the body as markdown sections to keep frontmatter short.
 */
export const agentFrontmatterSchema = anchorProfileBodySchema
  .pick({ name: true, kind: true, organization: true })
  .extend({
    // Brain (what)
    brainName: z.string().optional().describe("Name of the brain"),
    url: z.string().url().describe("Brain endpoint URL"),
    did: z.string().optional().describe("Decentralized identifier (public)"),

    // Relationship
    status: z.enum(["active", "archived"]).describe("Active or archived"),
    discoveredAt: z
      .string()
      .datetime()
      .describe("When this agent was first discovered"),
    discoveredVia: z
      .enum(["atproto", "manual"])
      .default("manual")
      .describe("How this agent was discovered"),
  });

export type AgentFrontmatter = z.infer<typeof agentFrontmatterSchema>;

/**
 * Agent metadata schema — subset of frontmatter for DB queries.
 */
export const agentMetadataSchema = agentFrontmatterSchema.pick({
  name: true,
  url: true,
  status: true,
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
