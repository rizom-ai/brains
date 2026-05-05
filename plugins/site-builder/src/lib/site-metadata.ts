import type { MessageSender } from "@brains/plugins";
import {
  SITE_METADATA_GET_CHANNEL,
  siteMetadataSchema,
  type SiteMetadata,
} from "@brains/site-composition";

type SendMessage = MessageSender;

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
      const parsed = siteMetadataSchema.safeParse(response.data);
      if (parsed.success) {
        return siteMetadataSchema.parse({ ...fallback, ...parsed.data });
      }
    }
  } catch {
    // No provider, provider failure, or messaging error: use fallback.
  }

  return fallback;
}
