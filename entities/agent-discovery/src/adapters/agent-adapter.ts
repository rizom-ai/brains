import { BaseEntityAdapter } from "@brains/plugins";
import { z, StructuredContentFormatter, slugifyUrl } from "@brains/utils";
import {
  agentEntitySchema,
  agentFrontmatterSchema,
  agentStatusSchema,
  type AgentEntity,
  type AgentFrontmatter,
  type AgentMetadata,
  type AgentSkill,
  type AgentStatus,
} from "../schemas/agent";

const agentBodySchema = z.object({
  about: z.string(),
  skills: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      tags: z.array(z.string()),
    }),
  ),
  notes: z.string(),
});

type AgentBody = z.infer<typeof agentBodySchema>;

function formatSkills(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "";
  const skills = value as AgentSkill[];

  return skills
    .map((s) => {
      const tags = s.tags.length > 0 ? ` [${s.tags.join(", ")}]` : "";
      return `- ${s.name}: ${s.description}${tags}`;
    })
    .join("\n");
}

function parseSkills(text: string): AgentSkill[] {
  if (!text.trim()) return [];

  const skills: AgentSkill[] = [];
  for (const line of text.split("\n")) {
    const match = line.match(/^- (.+?): (.+?)(?:\s+\[(.+?)\])?$/);
    if (match) {
      const name = match[1] ?? "";
      const description = match[2] ?? "";
      const tagsStr = match[3];
      const tags = tagsStr
        ? tagsStr
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [];
      skills.push({ name, description, tags });
    }
  }
  return skills;
}

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
        formatter: formatSkills,
        parser: parseSkills,
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
      entityType: "agent",
      schema: agentEntitySchema,
      frontmatterSchema: agentFrontmatterSchema,
    });
  }

  public fromMarkdown(markdown: string): Partial<AgentEntity> {
    const frontmatter = this.parseFrontMatter(markdown, agentFrontmatterSchema);
    const slug = slugifyUrl(frontmatter.url);

    return {
      content: markdown,
      entityType: "agent",
      metadata: {
        name: frontmatter.name,
        url: frontmatter.url,
        status: frontmatter.status,
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
