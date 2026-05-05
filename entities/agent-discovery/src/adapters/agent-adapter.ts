import { BaseEntityAdapter } from "@brains/plugins";
import { z, StructuredContentFormatter, slugifyUrl } from "@brains/utils";
import {
  agentEntitySchema,
  agentFrontmatterSchema,
  agentSkillSchema,
  agentStatusSchema,
  type AgentEntity,
  type AgentFrontmatter,
  type AgentMetadata,
  type AgentSkill,
  type AgentStatus,
} from "../schemas/agent";
import {
  formatAgentSkills,
  parseAgentSkills,
} from "../lib/agent-skill-markdown";
import { AGENT_ENTITY_TYPE } from "../lib/constants";

const agentBodySchema = z.object({
  about: z.string(),
  skills: z.array(agentSkillSchema),
  notes: z.string(),
});

type AgentBody = z.infer<typeof agentBodySchema>;

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
  kind: "professional" | "team" | "collective";
  organization?: string;
  brainName: string;
  url: string;
  did?: string;
  status: AgentStatus | string;
  discoveredAt: string;
  about: string;
  skills: AgentSkill[];
  notes: string;
}

export class AgentAdapter extends BaseEntityAdapter<
  AgentEntity,
  AgentMetadata
> {
  constructor() {
    super({
      entityType: AGENT_ENTITY_TYPE,
      schema: agentEntitySchema,
      frontmatterSchema: agentFrontmatterSchema,
    });
  }

  public fromMarkdown(markdown: string): Partial<AgentEntity> {
    const frontmatter = this.parseFrontMatter(markdown, agentFrontmatterSchema);
    const slug = slugifyUrl(frontmatter.url);

    return {
      content: markdown,
      entityType: AGENT_ENTITY_TYPE,
      metadata: {
        name: frontmatter.name,
        url: frontmatter.url,
        status: frontmatter.status,
        discoveredAt: frontmatter.discoveredAt,
        slug,
      },
    };
  }

  public createAgentContent(input: CreateAgentContentInput): string {
    const frontmatter: AgentFrontmatter = {
      name: input.name,
      kind: input.kind,
      ...(input.organization && { organization: input.organization }),
      brainName: input.brainName,
      url: input.url,
      ...(input.did && { did: input.did }),
      status: agentStatusSchema.parse(input.status),
      discoveredAt: input.discoveredAt,
    };

    const body = bodyFormatter.format({
      about: input.about,
      skills: input.skills,
      notes: input.notes,
    });

    return this.buildMarkdown(body, frontmatter);
  }

  public parseAgentContent(content: string): {
    about: string;
    skills: AgentSkill[];
    notes: string;
  } {
    const body = this.extractBody(content);
    if (!body.trim()) {
      return { about: "", skills: [], notes: "" };
    }
    try {
      const parsed = bodyFormatter.parse(body);
      return {
        about: parsed.about,
        skills: parsed.skills,
        notes: parsed.notes,
      };
    } catch {
      return { about: "", skills: [], notes: "" };
    }
  }

  public parseEntity(entity: AgentEntity): {
    frontmatter: AgentFrontmatter;
    body: { about: string; skills: AgentSkill[]; notes: string };
  } {
    return {
      frontmatter: this.parseFrontMatter(
        entity.content,
        agentFrontmatterSchema,
      ),
      body: this.parseAgentContent(entity.content),
    };
  }
}
