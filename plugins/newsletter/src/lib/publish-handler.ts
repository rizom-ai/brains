import { baseEntityParserSchema, z } from "@brains/sdk/entities";
import type { LoggerContract } from "@brains/sdk/services";
import { getErrorMessage } from "@brains/utils/error";
import type { ButtondownClient } from "./buttondown-client";

/** What the publish pipeline announces when something has gone out. */
export const publishCompletedSchema: z.ZodObject<{
  entityType: z.ZodString;
  entityId: z.ZodString;
  result: z.ZodObject<{
    id: z.ZodString;
    url: z.ZodOptional<z.ZodString>;
  }>;
}> = z.object({
  entityType: z.string(),
  entityId: z.string(),
  result: z.object({ id: z.string(), url: z.string().optional() }),
});

export type PublishCompletedPayload = z.output<typeof publishCompletedSchema>;

/**
 * The fields of a post the auto-send reads. A structural schema: this
 * package reads foreign `post` entities and proves just what it needs.
 */
const blogPostSourceSchema = baseEntityParserSchema.extend({
  metadata: z.looseObject({
    title: z.string(),
    slug: z.string(),
    status: z.string(),
    excerpt: z.string().optional(),
  }),
});

/** The one read the handler makes, as a subscription hands it over. */
export interface PublishedEntityReader {
  getEntity(request: { entityType: string; id: string }): Promise<unknown>;
}

export type PublishHandlerResult =
  | { success: true; emailId: string }
  | { success: true; skipped: true; reason: string }
  | { success: false; error: string };

/**
 * A published post becomes an email to every subscriber.
 */
export async function handlePublishCompleted(
  payload: PublishCompletedPayload,
  client: ButtondownClient,
  entities: PublishedEntityReader,
  logger: LoggerContract,
): Promise<PublishHandlerResult> {
  if (payload.entityType !== "post") {
    return {
      success: true,
      skipped: true,
      reason: "Only post entity types trigger auto-send",
    };
  }

  const stored = await entities.getEntity({
    entityType: "post",
    id: payload.entityId,
  });
  const post =
    stored === null || stored === undefined
      ? null
      : blogPostSourceSchema.safeParse(stored);
  if (!post?.success) {
    return { success: false, error: `Post ${payload.entityId} not found` };
  }

  logger.info("Auto-sending newsletter for published post", {
    postId: post.data.id,
    title: post.data.metadata.title,
  });

  try {
    const email = await client.createEmail({
      subject: post.data.metadata.title,
      body: post.data.content,
      status: "about_to_send",
    });
    logger.info("Newsletter sent for post", {
      postId: post.data.id,
      emailId: email.id,
    });
    return { success: true, emailId: email.id };
  } catch (error) {
    const message = getErrorMessage(error);
    logger.error("Failed to send newsletter for post", {
      postId: post.data.id,
      error: message,
    });
    return { success: false, error: message };
  }
}
