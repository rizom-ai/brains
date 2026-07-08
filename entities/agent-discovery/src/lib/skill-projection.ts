import type {
  DerivedEntityProjection,
  EntityPluginContext,
  JobHandler,
  JobOptions,
} from "@brains/plugins";
import { hasPersistedTargets } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import {
  SKILL_DERIVATION_JOB_TYPE,
  SKILL_DERIVATION_PROJECTION_ID,
  SKILL_ENTITY_TYPE,
} from "./constants";
import { deriveSkills } from "./skill-deriver";

const contentVisibilitySchema = z
  .union([z.enum(["public", "shared", "restricted"]), z.literal("private")])
  .optional()
  .transform((value) => {
    if (value === undefined) return "public";
    if (value === "private") return "restricted";
    return value;
  });

const skillDerivationJobDataSchema = z.object({
  mode: z.literal("derive"),
  replaceAll: z.boolean().default(false),
  reason: z.string().optional(),
  targetVisibility: contentVisibilitySchema,
});

type SkillDerivationJobData = z.output<typeof skillDerivationJobDataSchema>;

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
        targetVisibility: parsed.targetVisibility,
      });
      return deriveSkills(context, logger, {
        replaceAll: parsed.replaceAll,
        targetVisibility: parsed.targetVisibility,
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
        jobData: {
          mode: "derive",
          replaceAll: true,
          reason: "initial-sync",
          targetVisibility: "public",
        },
        jobOptions: getSkillDerivationJobOptions(pluginId, "initial-sync"),
      },
      sourceChange: {
        sourceTypes: ["topic-batch"],
        sourceType: "topic-batch",
        events: ["topics:batch-completed"],
        requireInitialSync: true,
        jobData: () => ({
          mode: "derive",
          replaceAll: true,
          reason: "topic-change",
          targetVisibility: "public",
        }),
        jobOptions: () =>
          getSkillDerivationJobOptions(pluginId, "topic-change"),
      },
    },
  ];
}
