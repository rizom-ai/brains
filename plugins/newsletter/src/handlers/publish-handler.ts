import type { Logger } from "@brains/utils";
import type { ICoreEntityService } from "@brains/plugins";
import { ButtondownClient } from "../lib/buttondown-client";
import type { ButtondownConfig } from "../config";

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
  | { success: true; emailId: string }
  | { success: true; skipped: true; reason: string }
  | { success: false; error: string };

/**
 * Blog post entity shape (minimal fields needed)
 */
interface BlogPost {
  id: string;
  entityType: string;
  content: string;
  contentHash: string;
  created: string;
  updated: string;
  metadata: {
    title: string;
    slug: string;
    status: string;
  };
}

/**
 * Handle publish:completed message to auto-send newsletter
 *
 * When a blog post is published, this handler creates and sends
 * a newsletter with the post content to all subscribers.
 */
export async function handlePublishCompleted(
  payload: PublishCompletedPayload,
  buttondownConfig: ButtondownConfig,
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
  const post = await entityService.getEntity<BlogPost>(
    "post",
    payload.entityId,
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
    const client = new ButtondownClient(buttondownConfig, logger);

    const email = await client.createEmail({
      subject: post.metadata.title,
      body: post.content,
      status: "about_to_send",
    });

    logger.info("Newsletter sent for post", {
      postId: post.id,
      emailId: email.id,
    });

    return {
      success: true,
      emailId: email.id,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
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
