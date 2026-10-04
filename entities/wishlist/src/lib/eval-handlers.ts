import {
  generateMarkdownWithFrontmatter,
  type EntityEvalDeclaration,
} from "@brains/sdk/entities";
import { slugify } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import { wish } from "../wish-entity";
import { wishSchema } from "../schemas/wish";
import { findExistingWish } from "./wish-dedup";

const wishInputSchema = z.object({
  title: z.string(),
  description: z.string(),
});
const sameWishInputSchema = z.object({
  stored: wishInputSchema,
  incoming: wishInputSchema,
});
const EVAL_STORED_ID = "eval-stored-wish";
function wishMarkdown(input: z.output<typeof wishInputSchema>): string {
  return generateMarkdownWithFrontmatter(input.description, {
    title: input.title,
    status: "new",
    priority: "medium",
    requested: 1,
  });
}

/** Explicit eval only: no provider calls during registration. */
export function wishlistEvalHandlers(
  sameWishDistance: number,
): EntityEvalDeclaration {
  return {
    sameWish: async (
      input,
      { fixtures, entities, ai },
    ): Promise<{
      distance: number;
      shortlisted: boolean;
      sameWish: boolean;
    }> => {
      const { stored, incoming } = sameWishInputSchema.parse(input);
      await fixtures.reset();
      await fixtures.seed({
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
      });
      await fixtures.settleEmbeddings();
      const query = wishMarkdown(incoming);
      const distances = await entities.nearest(wish, query, {
        visibility: "public",
        maxDistance: 2,
        limit: 1,
      });
      const distance = distances.find(
        (result) => result.entity.id === EVAL_STORED_ID,
      )?.distance;
      if (distance === undefined)
        throw new Error("The stored wish was not embedded");
      const match = await findExistingWish(
        {
          nearest: ({ query: text, ...options }) =>
            entities.nearest(wish, text, options),
          getEntity: (request) =>
            entities.getEntity(
              { ...request, visibilityScope: "public" },
              wishSchema,
            ),
          maxDistance: sameWishDistance,
          ai,
        },
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
