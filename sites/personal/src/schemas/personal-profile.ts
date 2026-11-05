import {
  commonProfileExtension,
  publicProfileViewSchema,
  type PublicProfileView,
  type PublicProfileViewSchema,
} from "@brains/profile";

/** JSON-native public profile used by personal-site templates. */
export const personalProfileSchema: PublicProfileViewSchema =
  publicProfileViewSchema;
export type PersonalProfile = PublicProfileView;

export const personalProfileExtension: typeof commonProfileExtension =
  commonProfileExtension;
