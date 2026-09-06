import type { ServicePublisher } from "@brains/sdk/services";
import {
  SITE_METADATA_GET_CHANNEL,
  type SiteMetadata,
} from "@brains/site-composition";
import { z } from "@brains/utils/zod";

/** Asking the bus a question, which is all this needs of messaging. */
export type SiteMetadataSender = ServicePublisher["send"];

const siteMetadataCTASchema = z.object({
  heading: z.string(),
  buttonText: z.string(),
  buttonLink: z.string(),
});

const siteMetadataSectionSchema = z.object({
  blurb: z.string().optional(),
});

const siteMetadataResponseSchema = z.object({
  represents: z.enum(["brain", "anchor"]).default("anchor"),
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

/** What an answering package sends back, when one is listening. */
const siteMetadataAnswerSchema = z.object({
  success: z.literal(true),
  data: siteMetadataResponseSchema,
});

/**
 * Resolve site metadata through the plugin message bus.
 *
 * Site-builder consumes the plain rendering contract and does not know which
 * package owns persistence. Nobody listening, or an answer in a shape this
 * does not recognise, means the configured fallback stands.
 */
export async function resolveSiteMetadata(
  send: SiteMetadataSender,
  fallback: SiteMetadata,
): Promise<SiteMetadata> {
  const answer = siteMetadataAnswerSchema.safeParse(
    await send({ type: SITE_METADATA_GET_CHANNEL, payload: undefined }),
  );
  return answer.success
    ? siteMetadataResponseSchema.parse({ ...fallback, ...answer.data.data })
    : fallback;
}
