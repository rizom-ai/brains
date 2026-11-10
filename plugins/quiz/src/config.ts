import { z } from "@brains/utils/zod";
import { formPolicyOverridesSchema } from "@brains/forms";

export const quizPluginConfigSchema: z.ZodObject<
  { intake: z.ZodOptional<typeof formPolicyOverridesSchema> },
  z.core.$strict
> = z.strictObject({
  /** Values the owner wants different from the forms engine's policy. */
  intake: formPolicyOverridesSchema.optional(),
});
export type QuizPluginConfig = z.input<typeof quizPluginConfigSchema>;
