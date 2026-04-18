import type {
  Plugin,
  EntityPluginContext,
  Template,
  BaseEntity,
} from "@brains/plugins";
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

    // Re-derive skills when topic entities change (after initial sync)
    const handleTopicChange = async (message: {
      payload: { entityType: string; entity?: BaseEntity };
    }): Promise<{ success: boolean }> => {
      if (!this.initialDerivationDone) return { success: true };
      if (message.payload.entityType !== "topic") return { success: true };

      this.logger.info("Topic changed, re-deriving skills");
      await deriveSkills(context, this.logger);
      return { success: true };
    };

    context.messaging.subscribe("entity:created", handleTopicChange);
    context.messaging.subscribe("entity:updated", handleTopicChange);

    // Dashboard widget — sidebar placement, name-only rendering.
    // Skills are the brain's A2A-advertised capabilities, so they sit
    // alongside Character (persona) in the sidebar rather than in the
    // main corpus column. The full description lives in CMS / A2A.
    context.messaging.subscribe(
      "system:plugins:ready",
      async (): Promise<{ success: boolean }> => {
        await context.messaging.send("dashboard:register-widget", {
          id: "skills",
          pluginId: this.id,
          title: "Skills",
          section: "sidebar",
          priority: 20,
          rendererName: "ListWidget",
          dataProvider: async () => {
            const skills =
              await context.entityService.listEntities<SkillEntity>("skill", {
                limit: 10,
              });
            return {
              items: skills.map((s) => ({
                id: s.id,
                name: s.metadata.name,
              })),
            };
          },
        });
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
  /**
   * Manual extract — replace-all. Operator reset.
   */
  public override async deriveAll(context: EntityPluginContext): Promise<void> {
    this.logger.info("Deriving skills from topics (replace-all)");
    const result = await deriveSkills(context, this.logger, {
      replaceAll: true,
    });
    this.logger.info("Skill derivation complete", result);
  }

  public hasRunInitialDerivation(): boolean {
    return this.initialDerivationDone;
  }
}

export function skillPlugin(): Plugin {
  return new SkillPlugin();
}
