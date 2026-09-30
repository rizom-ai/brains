import type {
  BaseDataSourceContext,
  DataSource,
  DataSourceSchema,
  IShell,
} from "@brains/plugins";
import { z } from "@rizom/site";
import { writingSchema } from "./writing";

/** Where the archive's lists come from: the blog's and the decks' own datasources. */
export interface WritingSources {
  posts: () => DataSource | undefined;
  decks: () => DataSource | undefined;
}

const LIMIT = 100;
const postList = z.object({ posts: writingSchema.shape.posts });
const deckList = z.object({ decks: writingSchema.shape.decks });

/**
 * The Writing archive's data: every essay and presentation, read through the
 * blog's and the decks' datasources so drafts stay out of production the way
 * their own lists keep them out, and so this site carries neither plugin.
 */
export class RizomWritingDataSource implements DataSource {
  public readonly id = "rizom:writing";
  public readonly name = "Rizom Writing DataSource";
  public readonly description =
    "The essays and presentations for the Writing archive";

  private readonly sources: WritingSources;

  constructor(sources: WritingSources) {
    this.sources = sources;
  }

  async fetch<T>(
    _query: unknown,
    outputSchema: DataSourceSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const posts = this.sources.posts();
    const decks = this.sources.decks();
    const [postData, deckData] = await Promise.all([
      posts?.fetch
        ? posts.fetch(
            { entityType: "post", query: { limit: LIMIT } },
            postList,
            context,
          )
        : postList.parse({}),
      decks?.fetch
        ? decks.fetch(
            { entityType: "deck", query: { limit: LIMIT } },
            deckList,
            context,
          )
        : deckList.parse({}),
    ]);
    return outputSchema.parse({ posts: postData.posts, decks: deckData.decks });
  }
}

/** The datasource on the brain's shell, built when the site's plugin registers. */
export function writingDataSource(shell: IShell): DataSource {
  const registry = shell.getDataSourceRegistry();
  return new RizomWritingDataSource({
    posts: () => registry.get("blog:entities"),
    decks: () => registry.get("decks:entities"),
  });
}
