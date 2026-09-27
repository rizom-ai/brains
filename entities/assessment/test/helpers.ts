import {
  BaseEntityAdapter,
  anchorProfileKindSchema,
  baseEntitySchema,
  formatAgentBody,
  type AgentBody,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";

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

  public createAgentContent(input: TestAgentFrontmatter & AgentBody): string {
    return this.buildMarkdown(
      formatAgentBody({
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
