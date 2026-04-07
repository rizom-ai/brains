import { z } from "@brains/utils";

/**
 * Problem section — currently has no dynamic content.
 * The schema is an empty object so createTemplate still has a type.
 */
export const ProblemContentSchema = z.object({});
export type ProblemContent = z.infer<typeof ProblemContentSchema>;
