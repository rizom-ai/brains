import type {
  Plugin,
  EntityPluginContext,
  Template,
  ProjectionRule,
  EntityTypeConfig,
} from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
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

export interface SkillPluginConfig {
  enableSkillDerivation: boolean;
}

export interface SkillPluginConfigInput {
  enableSkillDerivation?: boolean | undefined;
}

export const skillPluginConfigSchema: z.ZodType<
  SkillPluginConfig,
  SkillPluginConfigInput
> = z
  .object({
    enableSkillDerivation: z
      .boolean()
      .default(true)
      .describe("Derive skills from topic and agent evidence using AI"),
  })
  .strict();

export class SkillPlugin extends EntityPlugin<
  SkillEntity,
  SkillPluginConfig,
  SkillPluginConfigInput
> {
  readonly entityType: typeof SKILL_ENTITY_TYPE = SKILL_ENTITY_TYPE;
  readonly schema: typeof skillEntitySchema = skillEntitySchema;
  readonly adapter: SkillAdapter = skillAdapter;

  constructor(config: SkillPluginConfigInput = {}) {
    super(SKILL_PLUGIN_ID, packageJson, config, skillPluginConfigSchema);
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
    return this.config.enableSkillDerivation
      ? [createSkillProjectionRule()]
      : [];
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    registerSkillsDashboardWidget(context);
    registerSkillEvalHandlers(context, this.logger);
  }
}

export function skillPlugin(config: SkillPluginConfigInput = {}): Plugin {
  return new SkillPlugin(config);
}
