import type { Plugin, EntityPluginContext, Template } from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { z } from "@brains/utils";
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

  private initialDerivationDone = false;

  constructor() {
    super("skill", packageJson);
  }

  protected override getTemplates(): Record<string, Template> {
    return {
      "skill-derivation": skillDerivationTemplate,
    };
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    context.messaging.subscribe(
      "sync:initial:completed",
      async (): Promise<{ success: boolean }> => {
        if (!this.initialDerivationDone) {
          this.initialDerivationDone = true;
          await this.deriveAll(context);
        }
        return { success: true };
      },
    );

    this.registerEvalHandlers(context);
  }

  private registerEvalHandlers(context: EntityPluginContext): void {
    const deriveInputSchema = z.object({
      topicTitles: z.array(z.string()),
    });

    context.eval.registerHandler("deriveSkills", async (input: unknown) => {
      const parsed = deriveInputSchema.parse(input);

      // Create mock topic entities so deriveSkills can read them
      for (const title of parsed.topicTitles) {
        const id = title.toLowerCase().replace(/\s+/g, "-");
        const content = `---\ntitle: ${title}\nkeywords: []\n---\n${title}`;
        try {
          await context.entityService.createEntity({
            id,
            entityType: "topic",
            content,
            metadata: {},
          });
        } catch {
          // Topic may already exist
        }
      }

      // Run skill derivation
      const result = await deriveSkills(context, this.logger);

      // Return created skills
      const skills = await context.entityService.listEntities("skill");
      return {
        ...result,
        skills: skills.map((s) => s.metadata),
      };
    });
  }

  /**
   * Skills are cross-cutting — no per-entity derive().
   * Only deriveAll() makes sense (reads all topics + tools).
   */
  public override async deriveAll(context: EntityPluginContext): Promise<void> {
    this.logger.info("Deriving skills from topics");
    const result = await deriveSkills(context, this.logger);
    this.logger.info("Skill derivation complete", result);
  }

  public hasRunInitialDerivation(): boolean {
    return this.initialDerivationDone;
  }
}

export function skillPlugin(): Plugin {
  return new SkillPlugin();
}
