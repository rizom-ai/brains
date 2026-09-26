import { z } from "@brains/utils/zod";

type NullableCopy = z.ZodDefault<z.ZodNullable<z.ZodString>>;

/** Absent copy becomes null: JSON snapshots have no undefined. */
function nullableCopy(): NullableCopy {
  return z.string().nullable().default(null);
}

/** What the homepage needs from the team's or organization's anchor profile. */
export const organizationProfileSchema: z.ZodObject<{
  name: z.ZodString;
  description: NullableCopy;
  tagline: NullableCopy;
  intro: NullableCopy;
}> = z.object({
  name: z.string(),
  description: nullableCopy(),
  tagline: nullableCopy(),
  intro: nullableCopy(),
});

export type OrganizationProfile = z.output<typeof organizationProfileSchema>;
