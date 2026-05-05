import type {
  DerivedEntityProjection,
  EntityPluginContext,
  JobHandler,
  JobOptions,
} from "@brains/plugins";
import { hasPersistedTargets } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { z } from "@brains/utils";
import {
  SKILL_DERIVATION_JOB_TYPE,
  SKILL_DERIVATION_PROJECTION_ID,
  SKILL_ENTITY_TYPE,
} from "./constants";
import { deriveSkills } from "./skill-deriver";

const skillDerivationJobDataSchema = z.object({
  mode: z.literal("derive"),
  replaceAll: z.boolean().default(false),
  reason: z.string().optional(),
});

type SkillDerivationJobData = z.infer<typeof skillDerivationJobDataSchema>;

function createSkillDerivationHandler(
  context: EntityPluginContext,
  logger: Logger,
): JobHandler<string, unknown> {
  return {
    process: async (data): ReturnType<typeof deriveSkills> => {
      const parsed = skillDerivationJobDataSchema.parse(data);
      logger.info("Deriving skills from topics", {
        replaceAll: parsed.replaceAll,
        reason: parsed.reason,
      });
      return deriveSkills(context, logger, {
        replaceAll: parsed.replaceAll,
      });
    },
    validateAndParse: (data: unknown): SkillDerivationJobData | null => {
      const result = skillDerivationJobDataSchema.safeParse(data ?? {});
      return result.success ? result.data : null;
    },
  };
}

function getSkillDerivationJobOptions(
  pluginId: string,
  reason: string,
): JobOptions {
  return {
    source: pluginId,
    deduplication: "coalesce",
    deduplicationKey: `skill-derivation:${reason}`,
    metadata: {
      operationType: "data_processing",
      operationTarget: "skills",
    },
  };
}

export function getSkillDerivedEntityProjections(
  context: EntityPluginContext,
  logger: Logger,
  pluginId: string,
): DerivedEntityProjection[] {
  return [
    {
      id: SKILL_DERIVATION_PROJECTION_ID,
      targetType: SKILL_ENTITY_TYPE,
      job: {
        type: SKILL_DERIVATION_JOB_TYPE,
        handler: createSkillDerivationHandler(context, logger),
      },
      initialSync: {
        shouldEnqueue: async () =>
          !(await hasPersistedTargets(context, SKILL_ENTITY_TYPE)),
        jobData: { mode: "derive", replaceAll: true, reason: "initial-sync" },
        jobOptions: getSkillDerivationJobOptions(pluginId, "initial-sync"),
      },
      sourceChange: {
        sourceTypes: ["topic"],
        requireInitialSync: true,
        jobData: () => ({
          mode: "derive",
          replaceAll: false,
          reason: "topic-change",
        }),
        jobOptions: () =>
          getSkillDerivationJobOptions(pluginId, "topic-change"),
      },
    },
  ];
}
