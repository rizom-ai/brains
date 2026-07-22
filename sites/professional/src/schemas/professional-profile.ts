import {
  professionalProfileExtension,
  professionalProfileSchema,
} from "@brains/profile";

/** Shared profile contracts are owned by the profile plugin. */
export { professionalProfileExtension, professionalProfileSchema };

export type ProfessionalProfile = ReturnType<
  typeof professionalProfileSchema.parse
>;
