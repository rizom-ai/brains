import {
  generateMarkdownWithFrontmatter,
  parseMarkdown,
  z,
  type AnchorProfileKind,
} from "@brains/sdk/entities";
import { StructuredContentFormatter } from "@brains/content-formatters";
import {
  agentFrontmatterSchema,
  agentStatusSchema,
  type AgentFrontmatter,
  type AgentSkill,
  type AgentStatus,
} from "../schemas/agent";
import {
  formatAgentSkills,
  parseAgentSkills,
} from "../lib/agent-skill-markdown";

const agentBodySkillSchema: z.ZodObject<{
  name: z.ZodString;
  description: z.ZodString;
  tags: z.ZodArray<z.ZodString>;
}> = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
});

const agentBodySchema: z.ZodObject<{
  about: z.ZodString;
  skills: z.ZodArray<typeof agentBodySkillSchema>;
  notes: z.ZodString;
}> = z.object({
  about: z.string(),
  skills: z.array(agentBodySkillSchema),
  notes: z.string(),
});

type AgentBody = z.output<typeof agentBodySchema>;

const bodyFormatter = new StructuredContentFormatter<AgentBody>(
  agentBodySchema,
  {
    title: "Agent",
    mappings: [
      { key: "about", label: "About", type: "string" },
      {
        key: "skills",
        label: "Skills",
        type: "custom",
        formatter: formatAgentSkills,
        parser: parseAgentSkills,
      },
      { key: "notes", label: "Notes", type: "string" },
    ],
  },
);

export interface CreateAgentContentInput {
  name: string;
  kind: AnchorProfileKind;
  organization?: string | undefined;
  brainName: string;
  url: string;
  did?: string | undefined;
  repoDid?: string | undefined;
  brainDid?: string | undefined;
  anchorDid?: string | undefined;
  cardUri?: string | undefined;
  cardCid?: string | undefined;
  cardObservedAt?: string | undefined;
  cardLastCheckedAt?: string | undefined;
  cardLastError?: string | undefined;
  cardFailureCount?: number | undefined;
  cardUnavailableAt?: string | undefined;
  cardStaleAfter?: string | undefined;
  a2aEndpoint?: string | undefined;
  status: AgentStatus | string;
  discoveredAt: string;
  introducedBy?: string[] | undefined;
  hops?: number | undefined;
  about: string;
  skills: AgentSkill[];
  notes: string;
}

/**
 * How an agent reads on disk: frontmatter for the directory's own fields,
 * and a structured body a person can edit.
 *
 * Extracted from the adapter it used to live in. The runtime builds adapters
 * from declarations now, but the shape of an agent card is the package's.
 */
export function createAgentContent(input: CreateAgentContentInput): string {
  const frontmatter: AgentFrontmatter = {
    name: input.name,
    kind: input.kind,
    ...(input.organization && { organization: input.organization }),
    brainName: input.brainName,
    url: input.url,
    ...(input.did && { did: input.did }),
    ...(input.repoDid && { repoDid: input.repoDid }),
    ...(input.brainDid && { brainDid: input.brainDid }),
    ...(input.anchorDid && { anchorDid: input.anchorDid }),
    ...(input.cardUri && { cardUri: input.cardUri }),
    ...(input.cardCid && { cardCid: input.cardCid }),
    ...(input.cardObservedAt && { cardObservedAt: input.cardObservedAt }),
    ...(input.cardLastCheckedAt && {
      cardLastCheckedAt: input.cardLastCheckedAt,
    }),
    ...(input.cardLastError && { cardLastError: input.cardLastError }),
    ...(input.cardFailureCount !== undefined && {
      cardFailureCount: input.cardFailureCount,
    }),
    ...(input.cardUnavailableAt && {
      cardUnavailableAt: input.cardUnavailableAt,
    }),
    ...(input.cardStaleAfter && { cardStaleAfter: input.cardStaleAfter }),
    ...(input.a2aEndpoint && { a2aEndpoint: input.a2aEndpoint }),
    status: agentStatusSchema.parse(input.status),
    discoveredAt: input.discoveredAt,
    ...(input.introducedBy?.length && { introducedBy: input.introducedBy }),
    ...(input.hops !== undefined && { hops: input.hops }),
  };

  return generateMarkdownWithFrontmatter(
    bodyFormatter.format({
      about: input.about,
      skills: input.skills,
      notes: input.notes,
    }),
    frontmatter,
  );
}

/**
 * Read the body back. A body that will not parse yields empty fields rather
 * than throwing: an agent whose notes are malformed is still an agent, and
 * the directory should show it.
 */
export function parseAgentContent(content: string): AgentBody {
  const body = parseMarkdown(content).content;
  if (!body.trim()) return { about: "", skills: [], notes: "" };
  try {
    return bodyFormatter.parse(body);
  } catch {
    return { about: "", skills: [], notes: "" };
  }
}

export function parseAgentEntity(entity: { content: string }): {
  frontmatter: AgentFrontmatter;
  body: AgentBody;
} {
  return {
    frontmatter: agentFrontmatterSchema.parse(
      parseMarkdown(entity.content).frontmatter,
    ),
    body: parseAgentContent(entity.content),
  };
}
