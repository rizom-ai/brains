import type {
  Plugin,
  EntityPluginContext,
  Template,
  ProjectionRule,
  EntityTypeConfig,
} from "@brains/plugins";
import { EntityPlugin, emptyEntityPluginConfigSchema } from "@brains/plugins";
import { skillEntitySchema, type SkillEntity } from "../schemas/skill";
import { SkillAdapter } from "../adapters/skill-adapter";
import { skillDerivationTemplate } from "../templates/skill-derivation-template";
import {
  SKILL_DERIVATION_TEMPLATE_NAME,
  SKILL_ENTITY_TYPE,
  SKILL_PLUGIN_ID,
} from "../lib/constants";
import { registerSkillsDashboardWidget } from "../lib/skill-dashboard";
import { createSkillProjectionRule } from "../lib/skill-projection";
import { registerSkillEvalHandlers } from "../lib/skill-eval-handlers";
import packageJson from "../../package.json";

const skillAdapter: SkillAdapter = new SkillAdapter();

export class SkillPlugin extends EntityPlugin<
  SkillEntity,
  Record<string, never>,
  Record<string, never>
> {
  readonly entityType: typeof SKILL_ENTITY_TYPE = SKILL_ENTITY_TYPE;
  readonly schema: typeof skillEntitySchema = skillEntitySchema;
  readonly adapter: SkillAdapter = skillAdapter;

  constructor() {
    super(SKILL_PLUGIN_ID, packageJson, {}, emptyEntityPluginConfigSchema);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return { projectionSource: false, projectionSourceRole: "excluded" };
  }

  protected override getTemplates(): Record<string, Template> {
    return {
      [SKILL_DERIVATION_TEMPLATE_NAME]: skillDerivationTemplate,
    };
  }

  protected override getProjectionRules(
    _context: EntityPluginContext,
  ): ProjectionRule[] {
    return [createSkillProjectionRule()];
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    registerSkillsDashboardWidget(context);
    registerSkillEvalHandlers(context, this.logger);
  }
}

export function skillPlugin(): Plugin {
  return new SkillPlugin();
}
