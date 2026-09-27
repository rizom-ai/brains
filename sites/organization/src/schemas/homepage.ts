import { homepageOpeningSchema } from "@brains/site-atlas";
import { z } from "@brains/utils/zod";
import { organizationProfileSchema } from "./organization-profile";
import { agentRadarSchema } from "./radar";

type OpeningSchema = ReturnType<
  ReturnType<(typeof homepageOpeningSchema)["unwrap"]>["unwrap"]
>;

/** The homepage always has an opening: authored, or taken from the profile. */
const openingSchema: OpeningSchema = homepageOpeningSchema.unwrap().unwrap();

export const organizationHomepageSchema: z.ZodObject<{
  profile: typeof organizationProfileSchema;
  opening: typeof openingSchema;
  map: z.ZodDefault<z.ZodNullable<typeof agentRadarSchema>>;
}> = z.object({
  profile: organizationProfileSchema,
  opening: openingSchema,
  map: agentRadarSchema.nullable().default(null),
});

export type OrganizationHomepageData = z.output<
  typeof organizationHomepageSchema
>;
