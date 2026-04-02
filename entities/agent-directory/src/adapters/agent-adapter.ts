import { BaseEntityAdapter } from "@brains/plugins";
import { z, StructuredContentFormatter, slugifyUrl } from "@brains/utils";
import {
  agentEntitySchema,
  agentFrontmatterSchema,
  type AgentEntity,
  type AgentFrontmatter,
  type AgentMetadata,
  type AgentSkill,
} from "../schemas/agent";

/**
 * Body schema for structured content formatter
 */
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

/**
 * Format a skills array to markdown list.
 * Uses plain text — StructuredContentFormatter strips inline markdown.
 */
function formatSkills(value: unknown): string {
  const skills = value as AgentSkill[];
  if (!skills || skills.length === 0) return "";

  return skills
    .map((s) => {
      const tags = s.tags.length > 0 ? ` [${s.tags.join(", ")}]` : "";
      return `- ${s.name}: ${s.description}${tags}`;
    })
    .join("\n");
}

/**
 * Parse skills from markdown list format:
 * - Name: Description [tag1, tag2]
 */
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

/**
 * Structured content formatter for agent body sections
 */
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

/**
 * Input for creating agent markdown content
 */
export interface CreateAgentContentInput {
  name: string;
  kind: "professional" | "team" | "collective";
  organization?: string;
  brainName?: string;
  url: string;
  did?: string;
  status: "active" | "archived";
  discoveredAt: string;
  discoveredVia: "atproto" | "manual";
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

  public toMarkdown(entity: AgentEntity): string {
    return entity.content;
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

  /**
   * Build full markdown content with frontmatter and body sections
   */
  public createAgentContent(input: CreateAgentContentInput): string {
    const frontmatter: AgentFrontmatter = {
      name: input.name,
      kind: input.kind,
      ...(input.organization && { organization: input.organization }),
      ...(input.brainName && { brainName: input.brainName }),
      url: input.url,
      ...(input.did && { did: input.did }),
      status: input.status,
      discoveredAt: input.discoveredAt,
      discoveredVia: input.discoveredVia,
    };

    const body = bodyFormatter.format({
      about: input.about,
      skills: input.skills,
      notes: input.notes,
    });

    return this.buildMarkdown(body, frontmatter);
  }

  /**
   * Parse body sections from agent markdown content
   */
  public parseAgentContent(content: string): {
    about: string;
    skills: AgentSkill[];
    notes: string;
  } {
    const body = this.stripFrontmatter(content);
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

  /**
   * Strip frontmatter, return body only
   */
  private stripFrontmatter(content: string): string {
    const match = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
    return match ? (match[1] ?? "") : content;
  }
}
