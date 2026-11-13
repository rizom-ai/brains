import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import { skillMetadataSchema } from "./schemas/skill";
import { createSkillProjectionRule } from "./lib/skill-projection";
import { SKILL_ENTITY_TYPE } from "./lib/constants";

type SkillDefinition = EntityDefinition<
  typeof SKILL_ENTITY_TYPE,
  typeof skillMetadataSchema
>;

/** A skill's markdown: its fields are its header, and it has no body. */
const skillMarkdown: NonNullable<SkillDefinition["markdown"]> = {
  decode: ({ content, frontmatter }) => ({
    content: content.trim(),
    metadata: skillMetadataSchema.parse(frontmatter),
  }),
  encode: ({ content, metadata }) => ({
    content,
    frontmatter: skillMetadataSchema.parse(metadata),
  }),
};

function skillDefinition(options: {
  readonly derived: boolean;
}): SkillDefinition {
  return defineEntity({
    type: SKILL_ENTITY_TYPE,
    classification: "system",
    purpose: "A capability advertised by a remote agent.",
    metadata: skillMetadataSchema,
    markdown: skillMarkdown,
    config: { projectionSource: false, projectionSourceRole: "excluded" },
    ...(options.derived && {
      projectionRules: [createSkillProjectionRule()],
    }),
  });
}

/** A skill the brain derives from its topics and agents with AI. */
export const derivedSkill: SkillDefinition = skillDefinition({ derived: true });

/** A skill, with derivation off: none is derived. */
export const skill: SkillDefinition = skillDefinition({ derived: false });
