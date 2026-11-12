import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import type { PublishCompletedPayload } from "@brains/contracts";
import type {
  BaseEntity,
  GetEntityRequest,
} from "@brains/sdk/internal/entity-runtime";
import type { NewsletterDeliveryProvider } from "./contracts";
import { blogPostSourceSchema } from "./types";

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
  entityService: {
    getEntity(request: GetEntityRequest): Promise<BaseEntity | null>;
  },
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
  const found = await entityService.getEntity({
    entityType: "post",
    id: payload.entityId,
  });
  // Parsed as the entity service parses a read it is handed a schema for.
  const post = found ? blogPostSourceSchema.parse(found) : null;

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
