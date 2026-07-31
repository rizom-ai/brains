import { professionalProfileExtension } from "@brains/profile";
import { z } from "@brains/utils/zod";

interface ProfessionalSocialLink {
  platform: "github" | "instagram" | "linkedin" | "email" | "website";
  url: string;
  label: string | null;
}

export interface ProfessionalProfile {
  name: string;
  organization: string | null;
  description: string | null;
  avatar: string | null;
  website: string | null;
  email: string | null;
  socialLinks: ProfessionalSocialLink[] | null;
  tagline: string | null;
  intro: string | null;
  story: string | null;
  audience: string | null;
  role: string | null;
  expertise: string[] | null;
  currentFocus: string | null;
  availability: string | null;
}

const nullableString = z.string().nullable().default(null);

/** JSON-native professional profile used by site templates. */
export const professionalProfileSchema: z.ZodType<ProfessionalProfile> =
  z.object({
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
    role: nullableString,
    expertise: z.array(z.string()).nullable().default(null),
    currentFocus: nullableString,
    availability: nullableString,
  });

export { professionalProfileExtension };
