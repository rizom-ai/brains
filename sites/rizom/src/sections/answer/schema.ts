import { z } from "@brains/utils";

export const AnswerContentSchema = z.object({});
export type AnswerContent = z.infer<typeof AnswerContentSchema>;
