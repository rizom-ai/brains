import { z } from "@brains/utils/zod";

type NullableCopy = z.ZodDefault<z.ZodNullable<z.ZodString>>;
type NullableList = z.ZodDefault<z.ZodNullable<z.ZodArray<z.ZodString>>>;

/** Absent copy becomes null: JSON snapshots have no undefined. */
function nullableCopy(): NullableCopy {
  return z.string().nullable().default(null);
}
function nullableList(): NullableList {
  return z.array(z.string()).nullable().default(null);
}

type SocialLinks = z.ZodDefault<
  z.ZodNullable<
    z.ZodArray<
      z.ZodObject<{
        platform: z.ZodString;
        url: z.ZodString;
        label: NullableCopy;
      }>
    >
  >
>;

/**
 * What the site shows of the team's or organization's anchor profile. A
 * team profile carries purpose, capabilities and working principles; an
 * organization profile carries mission, offerings and values; both carry
 * focus areas. Whichever the anchor has is shown.
 */
export const organizationProfileSchema: z.ZodObject<{
  name: z.ZodString;
  description: NullableCopy;
  tagline: NullableCopy;
  intro: NullableCopy;
  story: NullableCopy;
  website: NullableCopy;
  email: NullableCopy;
  socialLinks: SocialLinks;
  purpose: NullableCopy;
  mission: NullableCopy;
  focusAreas: NullableList;
  capabilities: NullableList;
  offerings: NullableList;
  workingPrinciples: NullableList;
  values: NullableList;
}> = z.object({
  name: z.string(),
  description: nullableCopy(),
  tagline: nullableCopy(),
  intro: nullableCopy(),
  story: nullableCopy(),
  website: nullableCopy(),
  email: nullableCopy(),
  socialLinks: z
    .array(
      z.object({
        platform: z.string(),
        url: z.string(),
        label: nullableCopy(),
      }),
    )
    .nullable()
    .default(null),
  purpose: nullableCopy(),
  mission: nullableCopy(),
  focusAreas: nullableList(),
  capabilities: nullableList(),
  offerings: nullableList(),
  workingPrinciples: nullableList(),
  values: nullableList(),
});

export type OrganizationProfile = z.output<typeof organizationProfileSchema>;
