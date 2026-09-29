import { z } from "@brains/sdk/entities";

export interface AssessmentConfig {
  enableSwotDerivation: boolean;
}

export interface AssessmentConfigInput {
  enableSwotDerivation?: boolean | undefined;
}

/**
 * Deriving a SWOT calls a model over every agent and skill, so a brain that
 * does not want that work must be able to say so — the rule is not
 * registered at all when it is off, rather than registered and skipped.
 */
export const assessmentConfigSchema: z.ZodType<
  AssessmentConfig,
  AssessmentConfigInput
> = z
  .object({
    enableSwotDerivation: z
      .boolean()
      .default(true)
      .describe(
        "Derive SWOT assessments from agent and skill evidence using AI",
      ),
  })
  .strict();
