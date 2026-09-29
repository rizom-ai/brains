import type { EntityPluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import { slugify } from "@brains/utils/string-utils";
import { WishAdapter } from "../adapters/wish-adapter";
import { wishPrioritySchema, wishSchema } from "../schemas/wish";
import { SAME_WISH_DISTANCE, findExistingWish } from "../lib/wish-dedup";

export interface WishCreateData {
  title?: string;
  prompt?: string;
  content?: string;
  options?: {
    priority?: string;
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
  private readonly logger: Logger;
  private readonly context: EntityPluginContext;
  private readonly adapter = new WishAdapter();

  private readonly maxDistance: number;

  constructor(
    logger: Logger,
    context: EntityPluginContext,
    maxDistance: number = SAME_WISH_DISTANCE,
  ) {
    this.logger = logger;
    this.context = context;
    this.maxDistance = maxDistance;
  }

  async process(
    data: WishCreateData,
    _jobId: string,
    _progressReporter: ProgressReporter,
  ): Promise<WishCreateResult> {
    const title = data.title ?? data.prompt ?? "Untitled wish";
    const description = data.content ?? data.prompt ?? "";
    // options.priority arrives as an unchecked string from the tool call.
    const parsedPriority = wishPrioritySchema.safeParse(data.options?.priority);
    const priority = parsedPriority.success ? parsedPriority.data : "medium";
    const content = this.adapter.createWishContent(
      {
        title,
        status: "new",
        priority,
        requested: 1,
      },
      description,
    );

    const existing = await findExistingWish(
      {
        searchWithDistances: (request) =>
          this.context.entityService.searchWithDistances(request),
        getEntity: (request) =>
          this.context.entityService.getEntity(request, wishSchema),
        maxDistance: this.maxDistance,
        ai: this.context.ai,
      },
      { title, content },
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
        entity: {
          ...existing,
          content: updatedContent,
          metadata: { ...existing.metadata, requested: newRequested },
        },
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

    await this.context.entityService.createEntity({
      entity: {
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
