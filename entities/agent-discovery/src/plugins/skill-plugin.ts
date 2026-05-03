import type {
  Plugin,
  EntityPluginContext,
  Template,
  JobHandler,
  JobOptions,
  DerivedEntityProjection,
} from "@brains/plugins";
import { EntityPlugin, hasPersistedTargets } from "@brains/plugins";
import { z } from "@brains/utils";
import { skillEntitySchema, type SkillEntity } from "../schemas/skill";
import { SkillAdapter } from "../adapters/skill-adapter";
import { deriveSkills } from "../lib/skill-deriver";
import { skillDerivationTemplate } from "../templates/skill-derivation-template";
import packageJson from "../../package.json";

const skillAdapter = new SkillAdapter();

const skillDerivationJobDataSchema = z.object({
  mode: z.literal("derive"),
  replaceAll: z.boolean().default(false),
  reason: z.string().optional(),
});

type SkillDerivationJobData = z.infer<typeof skillDerivationJobDataSchema>;

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

  private createSkillDerivationHandler(
    context: EntityPluginContext,
  ): JobHandler<string, unknown> {
    return {
      process: async (data): ReturnType<typeof deriveSkills> => {
        const parsed = skillDerivationJobDataSchema.parse(data);
        this.logger.info("Deriving skills from topics", {
          replaceAll: parsed.replaceAll,
          reason: parsed.reason,
        });
        return deriveSkills(context, this.logger, {
          replaceAll: parsed.replaceAll,
        });
      },
      validateAndParse: (data: unknown): SkillDerivationJobData | null => {
        const result = skillDerivationJobDataSchema.safeParse(data ?? {});
        return result.success ? result.data : null;
      },
    };
  }

  protected override getDerivedEntityProjections(
    context: EntityPluginContext,
  ): DerivedEntityProjection[] {
    return [
      {
        id: "skill-derivation",
        targetType: "skill",
        job: {
          type: "skill:project",
          handler: this.createSkillDerivationHandler(context),
        },
        initialSync: {
          shouldEnqueue: async () =>
            !(await hasPersistedTargets(context, "skill")),
          jobData: { mode: "derive", replaceAll: true, reason: "initial-sync" },
          jobOptions: this.getDerivationJobOptions("initial-sync"),
        },
        sourceChange: {
          sourceTypes: ["topic"],
          requireInitialSync: true,
          jobData: () => ({
            mode: "derive",
            replaceAll: false,
            reason: "topic-change",
          }),
          jobOptions: () => this.getDerivationJobOptions("topic-change"),
        },
      },
    ];
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    // Dashboard widget — sidebar placement, name-only rendering.
    // Skills are the brain's A2A-advertised capabilities, so they sit
    // alongside Character (persona) in the sidebar rather than in the
    // main corpus column. The full description lives in CMS / A2A.
    context.messaging.subscribe(
      "system:plugins:ready",
      async (): Promise<{ success: boolean }> => {
        await context.messaging.send({
          type: "dashboard:register-widget",
          payload: {
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

  private getDerivationJobOptions(reason: string): JobOptions {
    return {
      source: this.id,
      deduplication: "coalesce",
      deduplicationKey: `skill-derivation:${reason}`,
      metadata: {
        operationType: "data_processing",
        operationTarget: "skills",
      },
    };
  }

  public hasRunInitialDerivation(): boolean {
    return (
      this.getDerivedEntityProjectionController(
        "skill-derivation",
      )?.hasQueuedInitialSync() ?? false
    );
  }
}

export function skillPlugin(): Plugin {
  return new SkillPlugin();
}
