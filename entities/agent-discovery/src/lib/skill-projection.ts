import {
  PROJECTION_ABSTAINED,
  ProjectionJsonObjectSchema,
  defineProjectionRule,
  scopedDerivedId,
  type ProjectionRule,
  type ProjectionExecutionContext,
  type ProjectionInputContext,
  type ProjectionAbstention,
  type ProjectionWriteIntent,
} from "@brains/sdk/entities";
import { generateIdFromText } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import { createSkillContent } from "./directory-markdown";
import type { AgentEntity } from "../schemas/agent";
import {
  skillFrontmatterSchema,
  type SkillEntity,
  type SkillFrontmatter,
} from "../schemas/skill";
import { skillDerivationTemplate } from "../templates/skill-derivation-template";
import {
  SKILL_DERIVATION_PROJECTION_ID,
  SKILL_DERIVATION_TEMPLATE_REF,
  SKILL_ENTITY_TYPE,
} from "./constants";
import { buildSkillPrompt } from "./skill-prompt";
import { buildTagVocabulary } from "./tag-vocabulary";

const topicMetadataSchema = z.looseObject({ name: z.string().optional() });

const skillProjectionInputSchema = z.object({
  topicTitles: z.array(z.string()),
  tagVocabulary: z.array(
    z.object({
      tag: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
  existingSkills: z.array(
    z.object({
      id: z.string(),
      content: z.string(),
      metadata: skillFrontmatterSchema,
      visibility: z.enum(["public", "shared", "restricted"]),
      projectionOwned: z.boolean(),
    }),
  ),
  targetVisibility: z.literal("public"),
  prompt: z.string(),
  templatePrompt: z.string(),
  model: z.string(),
  identity: ProjectionJsonObjectSchema,
});

type SkillProjectionInput = z.output<typeof skillProjectionInputSchema>;

function topicTitle(topic: {
  id: string;
  content: string;
  metadata: unknown;
}): string {
  const parsed = topicMetadataSchema.safeParse(topic.metadata);
  if (parsed.success && parsed.data.name) return parsed.data.name;
  return topic.content.match(/^title:\s*(.+)$/m)?.[1]?.trim() ?? topic.id;
}

async function selectSkillInput(
  context: ProjectionInputContext,
): Promise<SkillProjectionInput> {
  const targetVisibility = "public" as const;
  const [topics, agents, existingSkills, appInfo, templatePrompt] =
    await Promise.all([
      context.entities.listEntities({
        entityType: "topic",
        options: { filter: { visibilityScope: targetVisibility } },
      }),
      context.entities.listEntities<AgentEntity>({
        entityType: "agent",
        options: { filter: { visibilityScope: targetVisibility } },
      }),
      context.entities.listEntities<SkillEntity>({
        entityType: SKILL_ENTITY_TYPE,
        options: { filter: { visibilityScope: targetVisibility } },
      }),
      context.appInfo(),
      context.resolvePrompt(
        SKILL_DERIVATION_TEMPLATE_REF,
        skillDerivationTemplate.basePrompt ?? "",
      ),
    ]);
  const projectionOwnership = new Map(
    await Promise.all(
      existingSkills.map(async (skill): Promise<readonly [string, boolean]> => [
        skill.id,
        await context.entities.isProjectionOwnedEntity({
          entityType: SKILL_ENTITY_TYPE,
          id: skill.id,
        }),
      ]),
    ),
  );
  const topicTitles = topics
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(topicTitle);
  const tagVocabulary = buildTagVocabulary([], agents);
  const prompt = buildSkillPrompt({
    topicTitles,
    toolDescriptions: [],
    tagVocabulary,
  });

  return {
    topicTitles,
    tagVocabulary,
    existingSkills: existingSkills
      .filter((skill) => skill.visibility === targetVisibility)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((skill) => ({
        id: skill.id,
        content: skill.content,
        metadata: skill.metadata,
        visibility: skill.visibility,
        projectionOwned: projectionOwnership.get(skill.id) ?? false,
      })),
    targetVisibility,
    prompt,
    templatePrompt,
    model: appInfo.ai.model,
    identity: context.identityInput(),
  };
}

async function deriveSkillIntents(
  input: SkillProjectionInput,
  context: ProjectionExecutionContext,
): Promise<readonly ProjectionWriteIntent[] | ProjectionAbstention> {
  // No topics is not "no skills": it is normal during initial sync, before
  // extraction has run. Returning an empty set here would tell the runtime
  // every derived skill should be removed.
  if (input.topicTitles.length === 0) return PROJECTION_ABSTAINED;

  const generated = await context.ai.generate<{ skills: SkillFrontmatter[] }>({
    prompt: input.prompt,
    templateName: SKILL_DERIVATION_TEMPLATE_REF,
    representedIdentity: "brain",
  });
  const skills = z
    .array(skillFrontmatterSchema)
    .parse(generated.skills)
    .slice(0, 8);
  const desired = new Map(
    skills.map((skill) => [
      scopedDerivedId(generateIdFromText(skill.name), input.targetVisibility),
      skill,
    ]),
  );
  // A skill someone authored is not this derivation's to overwrite.
  const authoredIds = new Set(
    input.existingSkills
      .filter((skill) => !skill.projectionOwned)
      .map((skill) => skill.id),
  );
  const intents: ProjectionWriteIntent[] = [...desired.entries()]
    .filter(([id]) => !authoredIds.has(id))
    .map(([id, skill]) => ({
      operation: "upsert",
      entity: {
        id,
        entityType: SKILL_ENTITY_TYPE,
        content: createSkillContent(skill),
        metadata: skill,
        visibility: input.targetVisibility,
      },
    }));
  return intents;
}

export function createSkillProjectionRule(): ProjectionRule {
  return defineProjectionRule({
    id: SKILL_DERIVATION_PROJECTION_ID,
    version: "2",
    sources: [
      { kind: "entity", types: ["topic"] },
      { kind: "entity", types: ["agent"] },
    ],
    targetType: SKILL_ENTITY_TYPE,
    // The latest derivation is the whole truth about public skills.
    targets: { authority: "exclusive", visibility: "public" },
    inputSchema: skillProjectionInputSchema,
    selectInput: async (_trigger, context) => selectSkillInput(context),
    derive: deriveSkillIntents,
  });
}
