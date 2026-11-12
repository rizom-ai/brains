import type { z } from "@brains/utils/zod";
import { formPluginConfigSchema } from "@brains/forms";

/** The forms engine's plugin configuration. */
export const quizPluginConfigSchema: typeof formPluginConfigSchema =
  formPluginConfigSchema;
export type QuizPluginConfig = z.input<typeof quizPluginConfigSchema>;
