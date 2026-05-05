import type {
  Plugin,
  EntityPluginContext,
  Template,
  DerivedEntityProjection,
} from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { skillEntitySchema, type SkillEntity } from "../schemas/skill";
import { SkillAdapter } from "../adapters/skill-adapter";
import { skillDerivationTemplate } from "../templates/skill-derivation-template";
import {
  SKILL_DERIVATION_PROJECTION_ID,
  SKILL_DERIVATION_TEMPLATE_NAME,
  SKILL_ENTITY_TYPE,
  SKILL_PLUGIN_ID,
} from "../lib/constants";
import { registerSkillsDashboardWidget } from "../lib/skill-dashboard";
import { getSkillDerivedEntityProjections } from "../lib/skill-projection";
import { registerSkillEvalHandlers } from "../lib/skill-eval-handlers";
import packageJson from "../../package.json";

const skillAdapter = new SkillAdapter();

export class SkillPlugin extends EntityPlugin<SkillEntity> {
  readonly entityType = SKILL_ENTITY_TYPE;
  readonly schema = skillEntitySchema;
  readonly adapter = skillAdapter;

  constructor() {
    super(SKILL_PLUGIN_ID, packageJson);
  }

  protected override getTemplates(): Record<string, Template> {
    return {
      [SKILL_DERIVATION_TEMPLATE_NAME]: skillDerivationTemplate,
    };
  }

  protected override getDerivedEntityProjections(
    context: EntityPluginContext,
  ): DerivedEntityProjection[] {
    return getSkillDerivedEntityProjections(context, this.logger, this.id);
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    registerSkillsDashboardWidget(context, this.id);
    registerSkillEvalHandlers(context, this.logger);
  }

  public hasRunInitialDerivation(): boolean {
    return (
      this.getDerivedEntityProjectionController(
        SKILL_DERIVATION_PROJECTION_ID,
      )?.hasQueuedInitialSync() ?? false
    );
  }
}

export function skillPlugin(): Plugin {
  return new SkillPlugin();
}
