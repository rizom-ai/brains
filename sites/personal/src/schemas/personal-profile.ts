import {
  commonProfileExtension,
  professionalProfileSchema,
} from "@brains/profile";

/** Personal sites use the person/professional anchor-profile contract. */
export const personalProfileExtension: typeof commonProfileExtension =
  commonProfileExtension;

export const personalProfileSchema: typeof professionalProfileSchema =
  professionalProfileSchema;

export type PersonalProfile = ReturnType<typeof personalProfileSchema.parse>;
