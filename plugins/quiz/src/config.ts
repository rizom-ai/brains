import { z } from "@brains/utils/zod";
import {
  formPolicyOverridesSchema,
  type FormPolicyOverrides,
} from "@brains/forms";

export interface QuizPluginConfig {
  /** Values the owner wants different from the forms engine's policy. */
  intake?: FormPolicyOverrides | undefined;
}
export const quizPluginConfigSchema: z.ZodType<QuizPluginConfig> =
  z.strictObject({ intake: formPolicyOverridesSchema.optional() });
