import {
  BaseEntityAdapter,
  anchorProfileKindSchema,
  baseEntitySchema,
} from "@brains/plugins";
import { StructuredContentFormatter } from "@brains/content-formatters";
import { z } from "@brains/utils/zod";

export const testAgentSkillSchema: z.ZodObject<{
  name: z.ZodString;
  description: z.ZodString;
  tags: z.ZodArray<z.ZodString>;
}> = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
});

export type TestAgentSkill = z.output<typeof testAgentSkillSchema>;

export const testAgentStatusSchema: z.ZodEnum<{
  discovered: "discovered";
  approved: "approved";
}> = z.enum(["discovered", "approved"]);

export type TestAgentStatus = z.output<typeof testAgentStatusSchema>;

export const testAgentFrontmatterSchema: z.ZodObject<{
  name: z.ZodString;
  kind: typeof anchorProfileKindSchema;
  organization: z.ZodOptional<z.ZodString>;
  brainName: z.ZodString;
  url: z.ZodString;
  did: z.ZodOptional<z.ZodString>;
  status: typeof testAgentStatusSchema;
  discoveredAt: z.ZodString;
}> = z.object({
  name: z.string(),
  kind: anchorProfileKindSchema,
  organization: z.string().optional(),
  brainName: z.string(),
  url: z.string().url(),
  did: z.string().optional(),
  status: testAgentStatusSchema,
  discoveredAt: z.string().datetime(),
});

export type TestAgentFrontmatter = z.output<typeof testAgentFrontmatterSchema>;

export const testAgentEntitySchema: ReturnType<
  typeof baseEntitySchema.extend<{
    entityType: z.ZodLiteral<"agent">;
    metadata: z.ZodObject<{
      name: z.ZodString;
      url: z.ZodString;
      status: typeof testAgentStatusSchema;
      slug: z.ZodString;
    }>;
  }>
> = baseEntitySchema.extend({
  entityType: z.literal("agent"),
  metadata: z.object({
    name: z.string(),
    url: z.string().url(),
    status: testAgentStatusSchema,
    slug: z.string(),
  }),
});

export type TestAgentEntity = z.output<typeof testAgentEntitySchema>;

export const testSkillDataSchema: z.ZodObject<{
  name: z.ZodString;
  description: z.ZodString;
  tags: z.ZodArray<z.ZodString>;
  examples: z.ZodArray<z.ZodString>;
}> = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  examples: z.array(z.string()),
});

export type TestSkillData = z.output<typeof testSkillDataSchema>;

export const testSkillEntitySchema: ReturnType<
  typeof baseEntitySchema.extend<{
    entityType: z.ZodLiteral<"skill">;
    metadata: typeof testSkillDataSchema;
  }>
> = baseEntitySchema.extend({
  entityType: z.literal("skill"),
  metadata: testSkillDataSchema,
});

export type TestSkillEntity = z.output<typeof testSkillEntitySchema>;

const testAgentBodySchema: z.ZodObject<{
  about: z.ZodString;
  skills: z.ZodArray<typeof testAgentSkillSchema>;
  notes: z.ZodString;
}> = z.object({
  about: z.string(),
  skills: z.array(testAgentSkillSchema),
  notes: z.string(),
});

type TestAgentBody = z.output<typeof testAgentBodySchema>;

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
  TestAgentEntity["metadata"],
  TestAgentFrontmatter
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
