import type {
  Plugin,
  EntityPluginContext,
  Template,
  BaseEntity,
  JobHandler,
} from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { skillEntitySchema, type SkillEntity } from "../schemas/skill";
import { SkillAdapter } from "../adapters/skill-adapter";
import { deriveSkills } from "../lib/skill-deriver";
import { skillDerivationTemplate } from "../templates/skill-derivation-template";
import packageJson from "../../package.json";

const skillAdapter = new SkillAdapter();

const skillDerivationJobDataSchema = z.object({
  replaceAll: z.boolean().default(false),
  reason: z.string().optional(),
});

type SkillDerivationJobData = z.infer<typeof skillDerivationJobDataSchema>;

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

  private createSkillDerivationHandler(
    context: EntityPluginContext,
  ): JobHandler<"skill:derive", SkillDerivationJobData> {
    return {
      process: async (data): ReturnType<typeof deriveSkills> => {
        this.logger.info("Deriving skills from topics", {
          replaceAll: data.replaceAll,
          reason: data.reason,
        });
        return deriveSkills(context, this.logger, {
          replaceAll: data.replaceAll,
        });
      },
      validateAndParse: (data: unknown): SkillDerivationJobData | null => {
        const result = skillDerivationJobDataSchema.safeParse(data ?? {});
        return result.success ? result.data : null;
      },
    };
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    context.jobs.registerHandler(
      "derive",
      this.createSkillDerivationHandler(context),
    );

    context.messaging.subscribe(
      "sync:initial:completed",
      async (): Promise<{ success: boolean }> => {
        if (!this.initialDerivationDone) {
          const existingSkills =
            await context.entityService.listEntities<SkillEntity>("skill", {
              limit: 1,
            });
          if (existingSkills.length > 0) {
            this.logger.info(
              "Skipping initial skill derivation; skills already exist",
            );
            return { success: true };
          }
          await this.enqueueDerivation(context, true, "initial-sync");
          this.initialDerivationDone = true;
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

      this.logger.info("Topic changed, queueing skill derivation");
      await this.enqueueDerivation(context, false, "topic-change");
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

  private async enqueueDerivation(
    context: EntityPluginContext,
    replaceAll: boolean,
    reason: string,
  ): Promise<void> {
    await context.jobs.enqueue("derive", { replaceAll, reason }, null, {
      source: this.id,
      deduplication: "coalesce",
      deduplicationKey: `skill-derivation:${reason}`,
      metadata: {
        operationType: "data_processing",
        operationTarget: "skills",
      },
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
