import {
  anchorProfileBodySchema,
  professionalProfileExtension,
} from "@brains/plugins";

/**
 * Professional profile schema for site rendering.
 *
 * The professional extension is defined by identity-service so site packages
 * consume the profile contract instead of owning durable entity fields.
 */
export { professionalProfileExtension };

export const professionalProfileSchema = anchorProfileBodySchema.extend(
  professionalProfileExtension.shape,
);

/**
 * Professional profile type
 */
export type ProfessionalProfile = ReturnType<
  typeof professionalProfileSchema.parse
>;
