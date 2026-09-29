import type { EntityPluginContext } from "@brains/plugins";
import { waitForEmbeddingsToDrain } from "@brains/plugins";
import { slugify } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import { WishAdapter } from "../adapters/wish-adapter";

const wishInputSchema = z.object({
  title: z.string(),
  description: z.string(),
});

const sameWishInputSchema = z.object({
  stored: wishInputSchema,
  incoming: wishInputSchema,
});

const EVAL_STORED_ID = "eval-stored-wish";

const adapter = new WishAdapter();

/** The markdown a new wish is stored and embedded as. */
function wishMarkdown(wish: z.output<typeof wishInputSchema>): string {
  return adapter.createWishContent(
    { title: wish.title, status: "new", priority: "medium", requested: 1 },
    wish.description,
  );
}

/**
 * Eval hook for the embedding distance that decides whether two wishes ask
 * for the same thing, run against the real embedding model.
 */
export function registerWishlistEvalHandlers(params: {
  context: EntityPluginContext;
  sameWishDistance: number;
}): void {
  const { context, sameWishDistance } = params;

  context.eval.registerHandler("sameWish", async (input: unknown) => {
    const { stored, incoming } = sameWishInputSchema.parse(input);
    const existing = await context.entityService.listEntities({
      entityType: "wish",
    });
    await Promise.all(
      existing.map((wish) =>
        context.entityService.deleteEntity({ entityType: "wish", id: wish.id }),
      ),
    );

    await context.entityService.createEntity({
      entity: {
        id: EVAL_STORED_ID,
        entityType: "wish",
        content: wishMarkdown(stored),
        metadata: {
          title: stored.title,
          status: "new",
          priority: "medium",
          requested: 1,
          slug: slugify(stored.title),
        },
      },
    });
    await waitForEmbeddingsToDrain(context.jobs);

    const distances = await context.entityService.searchWithDistances({
      query: wishMarkdown(incoming),
    });
    const distance = distances.find(
      (result) => result.entityId === EVAL_STORED_ID,
    )?.distance;
    if (distance === undefined) {
      throw new Error("The stored wish was not embedded");
    }
    return {
      distance,
      threshold: sameWishDistance,
      sameWish: distance <= sameWishDistance,
    };
  });
}
