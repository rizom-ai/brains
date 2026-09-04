import type { IEntityService } from "@brains/plugins";
import {
  FeedRegistry,
  renderRssFeed,
  type FeedItem,
} from "@brains/site-composition";
import type { Logger } from "@brains/utils/logger";
import { promises as fs } from "fs";
import { resolveSafeOutputFile } from "./output-path";

export interface WriteSiteBuildFeedsOptions {
  outputDir: string;
  entityService: Pick<IEntityService, "listEntities">;
  environment: string;
  siteTitle: string | undefined;
  siteDescription: string | undefined;
  siteUrl: string | undefined;
  logger: Logger;
  signal: AbortSignal;
}

/**
 * Write the feeds entity packages declared.
 *
 * The declaring package says how one of its entities becomes an item; this
 * decides which entities qualify. A preview build carries everything so an
 * author can see unpublished work in situ; a real build carries only what
 * is published.
 */
export async function writeSiteBuildFeeds(
  options: WriteSiteBuildFeedsOptions,
): Promise<void> {
  options.signal.throwIfAborted();
  const includeUnpublished = options.environment === "preview";

  for (const declaration of FeedRegistry.getInstance().list()) {
    options.signal.throwIfAborted();

    // The feed only reads base fields, so the widened read is the honest one:
    // there is no shape here to prove beyond what every entity already has.
    const entities = await options.entityService.listEntities({
      entityType: declaration.entityType,
      options: { limit: 1000 },
    });

    const items = entities
      .filter(
        (entity) =>
          includeUnpublished || entity.metadata["status"] === "published",
      )
      // A null item is the package saying this one does not belong in a
      // feed — unfinished, or missing what a reader needs.
      .flatMap((entity): FeedItem[] => {
        const item = declaration.toItem(entity);
        return item ? [item] : [];
      });

    if (items.length === 0) {
      options.logger.info(
        `No feed items for ${declaration.entityType}, skipping ${declaration.path}`,
      );
      continue;
    }

    const xml = renderRssFeed(items, {
      title: options.siteTitle ?? "Feed",
      description: options.siteDescription ?? "Latest updates",
      link: `${(options.siteUrl ?? "https://example.com").replace(/\/+$/u, "")}/${declaration.routePrefix.replace(/^\/+/u, "")}`,
    });

    await fs.writeFile(
      resolveSafeOutputFile(options.outputDir, declaration.path),
      xml,
      "utf-8",
    );
    options.logger.info(
      `Wrote ${declaration.path} with ${items.length} ${declaration.entityType} items`,
    );
  }
}
