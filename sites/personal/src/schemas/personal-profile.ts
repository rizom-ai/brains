import {
  commonProfileExtension,
  publicProfileViewSchema,
} from "@brains/profile";

/** Personal sites render the loose common profile view without selecting a kind. */
export const personalProfileExtension: typeof commonProfileExtension =
  commonProfileExtension;

export const personalProfileSchema: typeof publicProfileViewSchema =
  publicProfileViewSchema;

export type PersonalProfile = ReturnType<typeof personalProfileSchema.parse>;
