import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import { directoryMarkdown } from "./lib/directory-markdown";
import { skillFrontmatterSchema, skillMetadataSchema } from "./schemas/skill";
import {
  SKILL_DERIVATION_TEMPLATE_NAME,
  SKILL_ENTITY_TYPE,
} from "./lib/constants";
import { skillDerivationTemplate } from "./templates/skill-derivation-template";
import { skillsWidgetDeclaration } from "./lib/skill-dashboard";

/**
 * A capability advertised by a remote agent.
 *
 * Frontmatter with no body: a skill is a name, a description, tags and
 * examples, which is the same shape the A2A contract carries — so the
 * interface reads the metadata directly.
 */
export const skill: EntityDefinition<
  typeof SKILL_ENTITY_TYPE,
  typeof skillMetadataSchema
> = defineEntity({
  type: SKILL_ENTITY_TYPE,
  purpose: "A capability advertised by a remote agent.",
  metadata: skillMetadataSchema,
  markdown: directoryMarkdown((frontmatter) =>
    skillFrontmatterSchema.parse(frontmatter),
  ),
  // Derived from agent and topic evidence, and never a source for anything
  // further.
  config: { projectionSource: false, projectionSourceRole: "excluded" },
  templates: { [SKILL_DERIVATION_TEMPLATE_NAME]: skillDerivationTemplate },
  dashboardWidgets: [skillsWidgetDeclaration],
});
