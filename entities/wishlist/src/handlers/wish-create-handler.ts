import type { EntityPluginContext } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { slugify } from "@brains/utils";
import { WishAdapter } from "../adapters/wish-adapter";
import type { WishEntity } from "../schemas/wish";
import { findExistingWish } from "../lib/wish-dedup";

export interface WishCreateData {
  title?: string;
  prompt?: string;
  content?: string;
  options?: {
    priority?: string;
    tags?: string[];
  };
}

export interface WishCreateResult {
  success: boolean;
  entityId?: string;
  existed?: boolean;
  requested?: number;
  error?: string;
}

/**
 * Handler for wish:create jobs.
 * Semantic dedup — if a similar wish exists, increments its count instead of creating.
 */
export class WishCreateHandler {
  private readonly adapter = new WishAdapter();

  constructor(
    private readonly logger: Logger,
    private readonly context: EntityPluginContext,
  ) {}

  async process(
    data: WishCreateData,
    _jobId: string,
    _progressReporter: ProgressReporter,
  ): Promise<WishCreateResult> {
    const title = data.title ?? data.prompt ?? "Untitled wish";
    const description = data.content ?? data.prompt ?? "";

    const existing = await findExistingWish(
      {
        search: (query, options) =>
          this.context.entityService.search<WishEntity>(query, options),
        getEntity: (entityType, id) =>
          this.context.entityService.getEntity<WishEntity>(entityType, id),
        similarityThreshold: 0.85,
      },
      { title, description },
    );

    if (existing) {
      const { frontmatter, description: existingDesc } =
        this.adapter.parseWishContent(existing.content);
      const newRequested = frontmatter.requested + 1;
      const updatedContent = this.adapter.createWishContent(
        { ...frontmatter, requested: newRequested },
        existingDesc,
      );

      await this.context.entityService.updateEntity({
        ...existing,
        content: updatedContent,
        metadata: { ...existing.metadata, requested: newRequested },
      });

      this.logger.info("Incremented wish request count", {
        id: existing.id,
        requested: newRequested,
      });

      return {
        success: true,
        entityId: existing.id,
        existed: true,
        requested: newRequested,
      };
    }

    const slug = slugify(title);
    const priority =
      (data.options?.priority as "low" | "medium" | "high" | undefined) ??
      "medium";
    const content = this.adapter.createWishContent(
      {
        title,
        status: "new",
        priority,
        requested: 1,
        tags: data.options?.tags ?? [],
      },
      description,
    );

    await this.context.entityService.createEntity({
      id: slug,
      entityType: "wish",
      content,
      metadata: {
        title,
        status: "new",
        priority,
        requested: 1,
        slug,
      },
    });

    this.logger.info("Created new wish", { id: slug, title });

    return {
      success: true,
      entityId: slug,
      existed: false,
      requested: 1,
    };
  }
}
