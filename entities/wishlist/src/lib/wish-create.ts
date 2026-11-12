import { entityRuntime } from "@brains/sdk/internal/entity-runtime";
import type {
  EntityCreateContext,
  EntityCreateResolution,
  EntityCreateRouting,
} from "@brains/sdk/entities";
import { slugify } from "@brains/utils/string-utils";
import type { wishMetadataSchema } from "../schemas/wish";
import { findExistingWish, wishMarkdown, wishSearch } from "./wish-dedup";

/**
 * What a create request means for the wishlist: a wish asked for again
 * raises its request count rather than starting a second record, judged by
 * embedding distance within `maxDistance` and a same-wish check. The
 * runtime writes what this answers, so "created" and "updated" describe
 * what it did.
 */
async function resolveWish(
  context: EntityCreateContext,
  maxDistance: number,
): Promise<EntityCreateResolution<typeof wishMetadataSchema>> {
  const { input } = context;
  if (input.visibility !== undefined && input.visibility !== "public") {
    return {
      refuse:
        "Wish creation currently supports public visibility only; use a note for shared or restricted capture.",
    };
  }
  const title = input.title ?? input.prompt ?? "Untitled wish";
  const description = input.content ?? input.prompt ?? "";
  const frontmatter = {
    title,
    status: "new",
    priority: "medium",
    requested: 1,
  } as const;
  const existing = await findExistingWish(
    wishSearch(entityRuntime(context), context.entities, maxDistance),
    { title, content: wishMarkdown(frontmatter, description) },
  );

  if (existing) {
    return {
      update: {
        id: existing.id,
        content: existing.content.trim(),
        metadata: {
          ...existing.metadata,
          requested: existing.metadata.requested + 1,
        },
      },
    };
  }

  const slug = slugify(title);
  return {
    create: {
      id: slug,
      content: description,
      metadata: { ...frontmatter, slug },
    },
  };
}

/**
 * Every shape a wish arrives in reaches the same resolution, as the class's
 * single create interceptor did: a title or prompt, or written content.
 */
export function wishCreateRoutes(
  maxDistance: number,
): EntityCreateRouting<typeof wishMetadataSchema> {
  const route = {
    resolve: (
      context: EntityCreateContext,
    ): Promise<EntityCreateResolution<typeof wishMetadataSchema>> =>
      resolveWish(context, maxDistance),
  };
  return { fromPrompt: route, fromContent: route, fromUpload: route };
}
