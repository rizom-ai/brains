import type { BaseEntity } from "@brains/plugins";
import { BaseEntityAdapter, baseEntitySchema } from "@brains/plugins";
import { StructuredContentFormatter } from "@brains/content-formatters";
import { z } from "@brains/utils/zod-v4";

export interface TestAgentSkill {
  name: string;
  description: string;
  tags: string[];
}

type TestAgentSkillSchema = z.ZodObject<{
  name: z.ZodString;
  description: z.ZodString;
  tags: z.ZodArray<z.ZodString>;
}>;

export const testAgentSkillSchema: TestAgentSkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
});

export type TestAgentStatus = "discovered" | "approved";

export const testAgentStatusSchema: z.ZodType<
  TestAgentStatus,
  TestAgentStatus
> = z.enum(["discovered", "approved"]);

export interface TestAgentFrontmatter {
  [key: string]: unknown;
  name: string;
  kind: "professional" | "team" | "collective";
  organization?: string | undefined;
  brainName: string;
  url: string;
  did?: string | undefined;
  status: TestAgentStatus;
  discoveredAt: string;
}

type TestAgentFrontmatterSchema = z.ZodObject<{
  name: z.ZodString;
  kind: z.ZodEnum<{
    professional: "professional";
    team: "team";
    collective: "collective";
  }>;
  organization: z.ZodOptional<z.ZodString>;
  brainName: z.ZodString;
  url: z.ZodString;
  did: z.ZodOptional<z.ZodString>;
  status: z.ZodType<TestAgentStatus, TestAgentStatus>;
  discoveredAt: z.ZodString;
}>;

export const testAgentFrontmatterSchema: TestAgentFrontmatterSchema = z.object({
  name: z.string(),
  kind: z.enum(["professional", "team", "collective"]),
  organization: z.string().optional(),
  brainName: z.string(),
  url: z.string().url(),
  did: z.string().optional(),
  status: testAgentStatusSchema,
  discoveredAt: z.string().datetime(),
});

export interface TestAgentMetadata {
  [key: string]: unknown;
  name: string;
  url: string;
  status: TestAgentStatus;
  slug: string;
}

export interface TestAgentEntity extends BaseEntity {
  entityType: "agent";
  metadata: TestAgentMetadata;
}

export const testAgentEntitySchema: z.ZodType<TestAgentEntity> =
  baseEntitySchema.extend({
    entityType: z.literal("agent"),
    metadata: z.object({
      name: z.string(),
      url: z.string().url(),
      status: testAgentStatusSchema,
      slug: z.string(),
    }),
  });

export interface TestSkillData {
  [key: string]: unknown;
  name: string;
  description: string;
  tags: string[];
  examples: string[];
}

type TestSkillDataSchema = z.ZodObject<{
  name: z.ZodString;
  description: z.ZodString;
  tags: z.ZodArray<z.ZodString>;
  examples: z.ZodArray<z.ZodString>;
}>;

export const testSkillDataSchema: TestSkillDataSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  examples: z.array(z.string()),
});

export interface TestSkillEntity extends BaseEntity {
  entityType: "skill";
  metadata: TestSkillData;
}

export const testSkillEntitySchema: z.ZodType<TestSkillEntity> =
  baseEntitySchema.extend({
    entityType: z.literal("skill"),
    metadata: testSkillDataSchema,
  });

interface TestAgentBody {
  about: string;
  skills: TestAgentSkill[];
  notes: string;
}

const testAgentBodySchema: z.ZodType<TestAgentBody, TestAgentBody> = z.object({
  about: z.string(),
  skills: z.array(testAgentSkillSchema),
  notes: z.string(),
});

function formatSkills(value: unknown): string {
  const parsed = z.array(testAgentSkillSchema).safeParse(value);
  if (!parsed.success || parsed.data.length === 0) return "";
  return parsed.data
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

const agentBodyFormatter: StructuredContentFormatter<TestAgentBody> =
  new StructuredContentFormatter<TestAgentBody>(testAgentBodySchema, {
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
  });

export class AgentAdapter extends BaseEntityAdapter<
  TestAgentEntity,
  TestAgentEntity["metadata"]
> {
  constructor() {
    super({
      entityType: "agent",
      purpose: "Test entity for unit tests.",
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
      purpose: "Test entity for unit tests.",
      schema: testSkillEntitySchema,
      frontmatterSchema: testSkillDataSchema,
    });
  }

  public fromMarkdown(markdown: string): Partial<TestSkillEntity> {
    const frontmatter = this.parseFrontMatter(markdown, testSkillDataSchema);
    return { content: markdown, entityType: "skill", metadata: frontmatter };
  }

  public createSkillContent(input: TestSkillData): string {
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
