import { entityRuntime } from "@brains/sdk/internal/entity-runtime";
import { z, type EntityEvalDeclaration } from "@brains/sdk/entities";
import { slugify } from "@brains/utils/string-utils";
import { wish } from "../wish";
import { findExistingWish, wishMarkdown, wishSearch } from "./wish-dedup";

const wishInputSchema = z.object({
  title: z.string(),
  description: z.string(),
});

const sameWishInputSchema = z.object({
  stored: wishInputSchema,
  incoming: wishInputSchema,
});

const EVAL_STORED_ID = "eval-stored-wish";

/** The markdown a new wish is stored and embedded as. */
function newWishMarkdown(input: z.output<typeof wishInputSchema>): string {
  return wishMarkdown(
    { title: input.title, status: "new", priority: "medium", requested: 1 },
    input.description,
  );
}

/**
 * Eval hook for the embedding distance that decides whether two wishes ask
 * for the same thing, run against the real embedding model: the full
 * production decision, distance shortlist and then the check.
 */
export function wishlistEvalHandlers(
  sameWishDistance: number,
): EntityEvalDeclaration {
  return {
    sameWish: async (
      input,
      context,
    ): Promise<{
      distance: number;
      shortlisted: boolean;
      sameWish: boolean;
    }> => {
      const { stored, incoming } = sameWishInputSchema.parse(input);
      const { fixtures } = context;
      await fixtures.reset();
      await fixtures.seed({
        id: EVAL_STORED_ID,
        entityType: "wish",
        content: newWishMarkdown(stored),
        metadata: {
          title: stored.title,
          status: "new",
          priority: "medium",
          requested: 1,
          slug: slugify(stored.title),
        },
      });
      await fixtures.settleEmbeddings();

      const runtime = entityRuntime(context);
      const query = newWishMarkdown(incoming);
      const distance = (
        await runtime.nearest(wish, query, { maxDistance: 2 })
      ).find(({ entity }) => entity.id === EVAL_STORED_ID)?.distance;
      if (distance === undefined) {
        throw new Error("The stored wish was not embedded");
      }
      const match = await findExistingWish(
        wishSearch(runtime, context.entities, sameWishDistance),
        { title: incoming.title, content: query },
      );
      return {
        distance,
        shortlisted: distance <= sameWishDistance,
        sameWish: match?.id === EVAL_STORED_ID,
      };
    },
  };
}
