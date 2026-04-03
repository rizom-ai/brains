import type { Plugin, EntityPluginContext, Template } from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { skillEntitySchema, type SkillEntity } from "../schemas/skill";
import { SkillAdapter } from "../adapters/skill-adapter";
import { deriveSkills } from "../lib/skill-deriver";
import { skillDerivationTemplate } from "../templates/skill-derivation-template";
import packageJson from "../../package.json";

const skillAdapter = new SkillAdapter();

export class SkillPlugin extends EntityPlugin<SkillEntity> {
  readonly entityType = "skill";
  readonly schema = skillEntitySchema;
  readonly adapter = skillAdapter;

  constructor() {
    super("skill", packageJson);
  }

  protected override getTemplates(): Record<string, Template> {
    return {
      "skill-derivation": skillDerivationTemplate,
    };
  }

  /**
   * Skills are cross-cutting — no per-entity derive().
   * Only deriveAll() makes sense (reads all topics + tools).
   */
  public override async deriveAll(context: EntityPluginContext): Promise<void> {
    this.logger.info("Deriving skills from topics and tools");
    const result = await deriveSkills(context, this.logger);
    this.logger.info("Skill derivation complete", result);
  }
}

export function skillPlugin(): Plugin {
  return new SkillPlugin();
}
