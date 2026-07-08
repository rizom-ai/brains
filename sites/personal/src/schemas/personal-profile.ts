import { anchorProfileBodySchema, baseProfileExtension } from "@brains/plugins";

/**
 * Personal profile fields — identical to base (tagline, intro, story)
 */
export const personalProfileExtension: typeof baseProfileExtension =
  baseProfileExtension;

export const personalProfileSchema: ReturnType<
  typeof anchorProfileBodySchema.extend<typeof personalProfileExtension.shape>
> = anchorProfileBodySchema.extend(personalProfileExtension.shape);

export type PersonalProfile = ReturnType<typeof personalProfileSchema.parse>;
