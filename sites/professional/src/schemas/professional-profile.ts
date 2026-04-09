import { z } from "@brains/utils";
import { anchorProfileBodySchema, baseProfileExtension } from "@brains/plugins";

/**
 * Professional-specific fields that extend the base profile schema
 * Used both to build the full schema and to register as a CMS extension
 */
export const professionalProfileExtension = baseProfileExtension.extend({
  expertise: z
    .array(z.string())
    .optional()
    .describe("Skills, domains, areas of focus"),
  currentFocus: z
    .string()
    .optional()
    .describe("What you're currently working on"),
  availability: z
    .string()
    .optional()
    .describe("What you're open to (consulting, speaking, etc.)"),
});

export const professionalProfileSchema = anchorProfileBodySchema.extend(
  professionalProfileExtension.shape,
);

/**
 * Professional profile type
 */
export type ProfessionalProfile = z.infer<typeof professionalProfileSchema>;
