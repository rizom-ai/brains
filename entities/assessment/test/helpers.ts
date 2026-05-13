import type { BaseEntity, SkillData } from "@brains/plugins";
import {
  BaseEntityAdapter,
  baseEntitySchema,
  skillDataSchema,
} from "@brains/plugins";
import { StructuredContentFormatter } from "@brains/content-formatters";
import { z } from "@brains/utils";

export const testAgentSkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
});

export const testAgentStatusSchema = z.enum(["discovered", "approved"]);

export const testAgentFrontmatterSchema = z.object({
  name: z.string(),
  kind: z.enum(["professional", "team", "collective"]),
  organization: z.string().optional(),
  brainName: z.string(),
  url: z.string().url(),
  did: z.string().optional(),
  status: testAgentStatusSchema,
  discoveredAt: z.string().datetime(),
});

export const testAgentEntitySchema = baseEntitySchema.extend({
  entityType: z.literal("agent"),
  metadata: z.object({
    name: z.string(),
    url: z.string().url(),
    status: testAgentStatusSchema,
    slug: z.string(),
  }),
});

export const testSkillEntitySchema = baseEntitySchema.extend({
  entityType: z.literal("skill"),
  metadata: skillDataSchema,
});

const testAgentBodySchema = z.object({
  about: z.string(),
  skills: z.array(testAgentSkillSchema),
  notes: z.string(),
});

export type TestAgentEntity = z.infer<typeof testAgentEntitySchema>;
export type TestSkillEntity = z.infer<typeof testSkillEntitySchema>;
export type TestAgentSkill = z.infer<typeof testAgentSkillSchema>;
export type TestAgentFrontmatter = z.infer<typeof testAgentFrontmatterSchema>;
type TestAgentBody = z.infer<typeof testAgentBodySchema>;

function formatSkills(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "";
  const skills = value as TestAgentSkill[];
  return skills
    .map((skill) => {
      const tags = skill.tags.length > 0 ? ` [${skill.tags.join(", ")}]` : "";
      return `- ${skill.name}: ${skill.description}${tags}`;
    })
    .join("\n");
}

function parseSkills(text: string): TestAgentSkill[] {
  if (!text.trim()) return [];
  return text
    .split("\n")
    .map((line) => line.match(/^- (.+?): (.+?)(?:\s+\[(.+?)\])?$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => ({
      name: match[1] ?? "",
      description: match[2] ?? "",
      tags: match[3]
        ? match[3]
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [],
    }));
}

const agentBodyFormatter = new StructuredContentFormatter<TestAgentBody>(
  testAgentBodySchema,
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

export class AgentAdapter extends BaseEntityAdapter<
  TestAgentEntity,
  TestAgentEntity["metadata"]
> {
  constructor() {
    super({
      entityType: "agent",
      schema: testAgentEntitySchema,
      frontmatterSchema: testAgentFrontmatterSchema,
    });
  }

  public fromMarkdown(markdown: string): Partial<TestAgentEntity> {
    return { content: markdown, entityType: "agent" };
  }

  public createAgentContent(
    input: TestAgentFrontmatter & TestAgentBody,
  ): string {
    return this.buildMarkdown(
      agentBodyFormatter.format({
        about: input.about,
        skills: input.skills,
        notes: input.notes,
      }),
      {
        name: input.name,
        kind: input.kind,
        ...(input.organization ? { organization: input.organization } : {}),
        brainName: input.brainName,
        url: input.url,
        ...(input.did ? { did: input.did } : {}),
        status: input.status,
        discoveredAt: input.discoveredAt,
      },
    );
  }
}

export class SkillAdapter extends BaseEntityAdapter<
  TestSkillEntity,
  TestSkillEntity["metadata"]
> {
  constructor() {
    super({
      entityType: "skill",
      schema: testSkillEntitySchema,
      frontmatterSchema: skillDataSchema,
    });
  }

  public fromMarkdown(markdown: string): Partial<TestSkillEntity> {
    const frontmatter = this.parseFrontMatter(markdown, skillDataSchema);
    return { content: markdown, entityType: "skill", metadata: frontmatter };
  }

  public createSkillContent(input: SkillData): string {
    return this.buildMarkdown("", input);
  }
}

export function withEntityDefaults<T extends BaseEntity>(
  entity: Omit<T, "contentHash" | "created" | "updated">,
): T {
  return {
    ...entity,
    contentHash: `hash-${entity.id}`,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  } as T;
}
