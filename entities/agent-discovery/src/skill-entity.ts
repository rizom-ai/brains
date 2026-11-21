import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import { bodyFieldsCodec } from "@brains/sdk/internal/entity-runtime";
import { skillMetadataSchema } from "./schemas/skill";
import { createSkillProjectionRule } from "./lib/skill-projection";
import { SKILL_ENTITY_TYPE } from "./lib/constants";

type SkillDefinition = EntityDefinition<
  typeof SKILL_ENTITY_TYPE,
  typeof skillMetadataSchema
>;

/**
 * A skill's markdown. Its current form states every field in the header,
 * with no body; its next (docs/plans/one-stored-form.md) keeps its name
 * and tags there and states its description and examples in the body.
 */
const skillMarkdown: NonNullable<SkillDefinition["markdown"]> = bodyFieldsCodec(
  {
    metadata: skillMetadataSchema,
    bodyFields: ["description", "examples"],
    content: (content) => content.trim(),
  },
);

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
