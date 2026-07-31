import { commonProfileExtension } from "@brains/profile";
import { z } from "@brains/utils/zod";

interface PersonalSocialLink {
  platform: "github" | "instagram" | "linkedin" | "email" | "website";
  url: string;
  label: string | null;
}

export interface PersonalProfile {
  name: string;
  organization: string | null;
  description: string | null;
  avatar: string | null;
  website: string | null;
  email: string | null;
  socialLinks: PersonalSocialLink[] | null;
  tagline: string | null;
  intro: string | null;
  story: string | null;
  audience: string | null;
}

const nullableString = z.string().nullable().default(null);

/** JSON-native public profile used by personal-site templates. */
export const personalProfileSchema: z.ZodType<PersonalProfile> = z.object({
  name: z.string(),
  organization: nullableString,
  description: nullableString,
  avatar: nullableString,
  website: nullableString,
  email: nullableString,
  socialLinks: z
    .array(
      z.object({
        platform: z.enum([
          "github",
          "instagram",
          "linkedin",
          "email",
          "website",
        ]),
        url: z.string(),
        label: nullableString,
      }),
    )
    .nullable()
    .default(null),
  tagline: nullableString,
  intro: nullableString,
  story: nullableString,
  audience: nullableString,
});

export const personalProfileExtension: typeof commonProfileExtension =
  commonProfileExtension;
