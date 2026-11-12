import type { ServiceClassMessaging } from "@brains/sdk/internal/service-runtime";
import {
  siteMetadataContract,
  siteMetadataSchema,
  type SiteMetadata,
} from "@brains/site-composition";

/**
 * Resolve site metadata through the plugin message bus.
 *
 * Site-builder consumes the plain rendering contract and does not know which
 * package owns persistence. If no provider answers, or its answer fails, the
 * configured fallback is used.
 */
export async function resolveSiteMetadata(
  messaging: Pick<ServiceClassMessaging, "request">,
  fallback: SiteMetadata,
): Promise<SiteMetadata> {
  const result = await messaging.request(siteMetadataContract, {});
  if (result.status !== "answered") return fallback;
  return siteMetadataSchema.parse({ ...fallback, ...result.data });
}
