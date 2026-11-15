// A published site bundles its declarations; this entry carries no runtime.
import {
  defineDataSource,
  type DataSourceDefinition,
} from "@brains/sdk/internal/site-runtime";
import { z } from "@rizom/site";
import { writingSchema } from "./writing";

const LIMIT = 100;
const postList = z.object({ posts: writingSchema.shape.posts });
const deckList = z.object({ decks: writingSchema.shape.decks });

/**
 * The Writing archive's data: every essay and presentation, read through the
 * blog's and the decks' datasources so drafts stay out of production the way
 * their own lists keep them out, and so this site carries neither plugin.
 */
export const writingDataSource: DataSourceDefinition = defineDataSource({
  id: "writing",
  name: "Rizom Writing DataSource",
  description: "The essays and presentations for the Writing archive",
  fetch: async (_query, _entities, context) => {
    const [postData, deckData] = await Promise.all([
      context.dataSources.fetch(
        "@brains/blog:entities",
        { entityType: "post", query: { limit: LIMIT } },
        postList,
      ),
      context.dataSources.fetch(
        "@brains/decks:entities",
        { entityType: "deck", query: { limit: LIMIT } },
        deckList,
      ),
    ]);
    return {
      posts: (postData ?? postList.parse({})).posts,
      decks: (deckData ?? deckList.parse({})).decks,
    };
  },
});
