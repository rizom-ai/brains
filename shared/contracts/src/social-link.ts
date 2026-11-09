import { z } from "@brains/utils/zod";

/**
 * Where an anchor can be found: the platforms a profile's social links name.
 * The anchor profile, site-info, the site build and the fleet registry all
 * read this one list.
 */
export const socialLinkPlatformSchema: z.ZodEnum<{
  github: "github";
  instagram: "instagram";
  linkedin: "linkedin";
  podcast: "podcast";
  email: "email";
  website: "website";
}> = z.enum(["github", "instagram", "linkedin", "podcast", "email", "website"]);

export type SocialLinkPlatform = z.output<typeof socialLinkPlatformSchema>;

/** A profile's link to one platform, with an optional display label. */
export const socialLinkSchema: z.ZodObject<{
  platform: typeof socialLinkPlatformSchema;
  url: z.ZodString;
  label: z.ZodOptional<z.ZodString>;
}> = z.object({
  platform: socialLinkPlatformSchema.describe("Social media platform"),
  url: z.string().describe("Profile or contact URL"),
  label: z.string().optional().describe("Optional display label"),
});

export type SocialLink = z.output<typeof socialLinkSchema>;

/** How a link names its platform when it carries no label of its own. */
export const SOCIAL_LINK_PLATFORM_LABELS: Record<SocialLinkPlatform, string> = {
  github: "GitHub",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  podcast: "Podcast",
  email: "Email",
  website: "Website",
};
