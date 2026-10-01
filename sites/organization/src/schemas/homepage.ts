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
  askBox: z.ZodDefault<z.ZodBoolean>;
}> = z.object({
  profile: organizationProfileSchema,
  opening: openingSchema,
  map: agentRadarSchema.nullable().default(null),
  /** Web Chat serves the guest box here: dock it in the frame. */
  askBox: z.boolean().default(false),
});

export type OrganizationHomepageData = z.output<
  typeof organizationHomepageSchema
>;
