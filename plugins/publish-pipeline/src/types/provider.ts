import type { PublishProvider, PublishResult } from "@brains/utils";

/**
 * Default provider for internal publishing (blog, decks).
 * Does not call any external API - just marks entity as published.
 */
export class InternalPublishProvider implements PublishProvider {
  name = "internal";

  async publish(
    _content: string,
    _metadata: Record<string, unknown>,
  ): Promise<PublishResult> {
    return { id: "internal" };
  }
}
