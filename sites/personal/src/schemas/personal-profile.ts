import type { z } from "@brains/utils";
import { anchorProfileBodySchema, baseProfileExtension } from "@brains/plugins";

/**
 * Personal profile fields — identical to base (tagline, intro, story)
 */
export const personalProfileExtension = baseProfileExtension;

export const personalProfileSchema = anchorProfileBodySchema.extend(
  personalProfileExtension.shape,
);

export type PersonalProfile = z.infer<typeof personalProfileSchema>;
