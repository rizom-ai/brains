import {
  professionalProfileExtension,
  professionalProfileViewSchema,
} from "@brains/profile";

/** Professional sites extend the loose common view with fields they render. */
export { professionalProfileExtension };
export const professionalProfileSchema: typeof professionalProfileViewSchema =
  professionalProfileViewSchema;

export type ProfessionalProfile = ReturnType<
  typeof professionalProfileSchema.parse
>;
