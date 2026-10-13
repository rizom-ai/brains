import { z } from "@brains/utils/zod";

type NullableDefault = z.ZodDefault<z.ZodNullable<z.ZodString>>;

/**
 * An agent on the radar. Entity-shaped (`entityType`, `content`,
 * `metadata.slug`) so site-builder enrichment links it to its agent page.
 */
export const radarAgentSchema: z.ZodObject<{
  id: z.ZodString;
  entityType: z.ZodLiteral<"agent">;
  content: z.ZodString;
  metadata: z.ZodObject<{ slug: z.ZodString }>;
  name: z.ZodString;
  kind: z.ZodEnum<{
    person: "person";
    team: "team";
    organization: "organization";
  }>;
  status: z.ZodEnum<{ approved: "approved"; discovered: "discovered" }>;
  x: z.ZodNumber;
  y: z.ZodNumber;
  constellation: z.ZodNullable<z.ZodString>;
  url: NullableDefault;
  typeLabel: NullableDefault;
}> = z.object({
  id: z.string(),
  entityType: z.literal("agent"),
  content: z.string(),
  metadata: z.object({ slug: z.string() }),
  name: z.string(),
  kind: z.enum(["person", "team", "organization"]),
  /** Approved agents the team works with, or first-order agents awaiting review. */
  status: z.enum(["approved", "discovered"]),
  /** Position in the radar's 0–100 square, the team at (50, 50). */
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  /** The name of the constellation it belongs to, if any. */
  constellation: z.string().nullable(),
  // Null until enrichment links it; JSON has no undefined.
  url: z.string().nullable().default(null),
  typeLabel: z.string().nullable().default(null),
});

/** Related agents, each joined to the one nearest it, named by a tag they share. */
export const radarConstellationSchema: z.ZodObject<{
  id: z.ZodString;
  name: z.ZodString;
  memberIds: z.ZodArray<z.ZodString>;
  links: z.ZodArray<z.ZodObject<{ from: z.ZodString; to: z.ZodString }>>;
  x: z.ZodNumber;
  y: z.ZodNumber;
}> = z.object({
  id: z.string(),
  name: z.string(),
  memberIds: z.array(z.string()).min(2),
  links: z.array(z.object({ from: z.string(), to: z.string() })).min(1),
  /** The members' mean position, where the name is set. */
  x: z.number(),
  y: z.number(),
});

export const agentRadarSchema: z.ZodObject<{
  agents: z.ZodArray<typeof radarAgentSchema>;
  constellations: z.ZodArray<typeof radarConstellationSchema>;
}> = z.object({
  agents: z.array(radarAgentSchema),
  constellations: z.array(radarConstellationSchema),
});

export type RadarAgent = z.output<typeof radarAgentSchema>;
export type RadarConstellation = z.output<typeof radarConstellationSchema>;
export type AgentRadar = z.output<typeof agentRadarSchema>;
