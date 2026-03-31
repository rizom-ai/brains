import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/plugins";

/**
 * Agent frontmatter schema — structured data in YAML frontmatter.
 * Skills live in the body as markdown sections to keep frontmatter short.
 */
export const agentFrontmatterSchema = z.object({
  // Anchor (who)
  name: z.string().describe("Anchor name (person, team, or organization)"),
  organization: z
    .string()
    .optional()
    .describe("Organization the anchor belongs to"),

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
