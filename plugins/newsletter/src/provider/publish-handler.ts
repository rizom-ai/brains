import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import type { ICoreEntityService } from "@brains/plugins";
import type { NewsletterDeliveryProvider } from "./contracts";
import { blogPostSourceSchema } from "./types";

/**
 * Payload from publish:completed message
 */
export interface PublishCompletedPayload {
  entityType: string;
  entityId: string;
  result: {
    id: string;
    url?: string;
  };
}

/**
 * Result of handling publish completed event
 */
export type PublishHandlerResult =
  | { success: true; deliveryId: string }
  | { success: true; skipped: true; reason: string }
  | { success: false; error: string };

/**
 * Handle publish:completed message to auto-send newsletter
 *
 * When a blog post is published, this handler creates and sends
 * a newsletter with the post content to all subscribers.
 */
export async function handlePublishCompleted(
  payload: PublishCompletedPayload,
  provider: NewsletterDeliveryProvider,
  entityService: ICoreEntityService,
  logger: Logger,
): Promise<PublishHandlerResult> {
  // Only handle post entity types
  if (payload.entityType !== "post") {
    return {
      success: true,
      skipped: true,
      reason: "Only post entity types trigger auto-send",
    };
  }

  // Fetch the post
  const post = await entityService.getEntity(
    {
      entityType: "post",
      id: payload.entityId,
    },
    blogPostSourceSchema,
  );

  if (!post) {
    return {
      success: false,
      error: `Post ${payload.entityId} not found`,
    };
  }

  logger.info("Auto-sending newsletter for published post", {
    postId: post.id,
    title: post.metadata.title,
  });

  try {
    const delivery = await provider.publish(post.content, {
      subject: post.metadata.title,
    });

    logger.info("Newsletter sent for post", {
      postId: post.id,
      provider: provider.name,
      deliveryId: delivery.id,
    });

    return {
      success: true,
      deliveryId: delivery.id,
    };
  } catch (error) {
    const msg = getErrorMessage(error);
    logger.error("Failed to send newsletter for post", {
      postId: post.id,
      error: msg,
    });

    return {
      success: false,
      error: msg,
    };
  }
}
