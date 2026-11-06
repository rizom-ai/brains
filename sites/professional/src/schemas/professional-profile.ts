import {
  professionalProfileExtension,
  professionalProfileViewSchema,
  type ProfessionalProfileView,
  type ProfessionalProfileViewSchema,
} from "@brains/profile";

/** JSON-native professional profile used by site templates. */
export const professionalProfileSchema: ProfessionalProfileViewSchema =
  professionalProfileViewSchema;
export type ProfessionalProfile = ProfessionalProfileView;

export { professionalProfileExtension };
