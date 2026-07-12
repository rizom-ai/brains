import type { MessageSender } from "@brains/plugins";
import {
  SITE_METADATA_GET_CHANNEL,
  type SiteMetadata,
} from "@brains/site-composition";
import { z } from "@brains/utils/zod";

type SendMessage = MessageSender;

const siteMetadataCTASchema = z.object({
  heading: z.string(),
  buttonText: z.string(),
  buttonLink: z.string(),
});

const siteMetadataSectionSchema = z.object({
  blurb: z.string().optional(),
});

const siteMetadataResponseSchema = z.object({
  title: z.string(),
  description: z.string(),
  url: z.string().optional(),
  copyright: z.string().optional(),
  logo: z.boolean().optional(),
  themeMode: z.enum(["light", "dark"]).optional(),
  analyticsScript: z.string().optional(),
  cta: siteMetadataCTASchema.optional(),
  sections: z.record(z.string(), siteMetadataSectionSchema).optional(),
});

/**
 * Resolve site metadata through the plugin message bus.
 *
 * Site-builder consumes the plain rendering contract and does not know which
 * package owns persistence. If no provider is registered, or a provider returns
 * invalid data, the configured fallback is used.
 */
export async function resolveSiteMetadata(
  sendMessage: SendMessage,
  fallback: SiteMetadata,
): Promise<SiteMetadata> {
  try {
    const response = await sendMessage({
      type: SITE_METADATA_GET_CHANNEL,
      payload: undefined,
    });

    if ("success" in response && response.success && response.data) {
      const parsed = siteMetadataResponseSchema.safeParse(response.data);
      if (parsed.success) {
        return siteMetadataResponseSchema.parse({
          ...fallback,
          ...parsed.data,
        });
      }
    }
  } catch {
    // No provider, provider failure, or messaging error: use fallback.
  }

  return fallback;
}
