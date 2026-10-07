import { z } from "@brains/utils/zod";
import { SAME_QUESTION_DISTANCE } from "../lib/faq-question";

export const faqConfigSchema: z.ZodObject<{
  enabled: z.ZodDefault<z.ZodBoolean>;
  sameQuestionDistance: z.ZodDefault<z.ZodNumber>;
}> = z.object({
  enabled: z.boolean().default(true),
  sameQuestionDistance: z
    .number()
    .min(0)
    .max(1)
    .default(SAME_QUESTION_DISTANCE),
});
export type FaqConfig = z.output<typeof faqConfigSchema>;
export type FaqConfigInput = z.input<typeof faqConfigSchema>;
