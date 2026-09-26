import { homepageAtlasSchema, homepageOpeningSchema } from "@brains/site-atlas";
import { z } from "@brains/utils/zod";
import { organizationProfileSchema } from "./organization-profile";

type OpeningSchema = ReturnType<
  ReturnType<(typeof homepageOpeningSchema)["unwrap"]>["unwrap"]
>;

/** The homepage always has an opening: authored, or taken from the profile. */
const openingSchema: OpeningSchema = homepageOpeningSchema.unwrap().unwrap();

export const organizationHomepageSchema: z.ZodObject<{
  profile: typeof organizationProfileSchema;
  opening: typeof openingSchema;
  atlas: typeof homepageAtlasSchema;
}> = z.object({
  profile: organizationProfileSchema,
  opening: openingSchema,
  atlas: homepageAtlasSchema,
});

export type OrganizationHomepageData = z.output<
  typeof organizationHomepageSchema
>;
