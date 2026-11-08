import {
  defineDataSource,
  defineEntity,
  defineEntityPackage,
  z,
  type DataSourceDefinition,
  type EntityReader,
  type EntityDataSourceDefinition,
  type EntityDefinition,
  type EntityFeedBuild,
  type EntityFeedDeclaration,
  type EntityOf,
  type FeedItem,
} from "@rizom/brain/entities";
import { bookmark } from "./index";

// Compile-only: checked by the fixture typecheck, never loaded by the brain.
async function bookmarkTitles(entities: EntityReader): Promise<string[]> {
  const saved = await entities.list(bookmark, {
    sort: [{ field: "title", direction: "asc" }],
    limit: 20,
  });
  return saved.map((entry) => entry.metadata.title);
}

export const readingList: DataSourceDefinition = defineDataSource({
  id: "reading-list",
  name: "Reading list",
  description: "Saved page titles for the reading list section",
  fetch: async (_query, entities, context) => ({
    titles: await bookmarkTitles(entities),
    total: await entities.count(bookmark),
    featured: (await entities.get(bookmark, "featured"))?.metadata.url ?? null,
    preview: context.publishedOnly !== true,
  }),
});

interface ShelfCard {
  readonly title: string;
  readonly url: string;
}
interface Shelf {
  readonly cards: readonly ShelfCard[];
  readonly page: number;
  readonly pages: number;
}
interface Titles {
  readonly titles: readonly string[];
}

// List and detail over one declared type: the runtime derives the schema
// from the definition, then pages, sorts, filters and finds neighbors.
export const bookmarkShelf: EntityDataSourceDefinition<
  typeof bookmark,
  ShelfCard,
  Shelf
> = defineDataSource({
  id: "bookmark-shelf",
  name: "Bookmark shelf",
  description: "Saved pages, ten to a page, each with its neighbors",
  entity: bookmark,
  defaultSort: [{ field: "title", direction: "asc", nullsLast: true }],
  defaultLimit: 10,
  lookupField: "id",
  enableNavigation: true,
  navigationLimit: 500,
  filter: (query) =>
    typeof query["title"] === "string"
      ? { metadata: { title: query["title"] } }
      : undefined,
  transform: (entry) => ({
    title: entry.metadata.title,
    url: entry.metadata.url,
  }),
  list: (items, pagination) => ({
    cards: [...items],
    page: pagination?.currentPage ?? 1,
    pages: pagination?.totalPages ?? 1,
  }),
  detail: async ({ item, navigation, siblings, entities }) => ({
    card: item,
    previous: navigation?.prev?.title ?? null,
    next: navigation?.next?.title ?? null,
    position: siblings.findIndex((sibling) => sibling.url === item.url),
    total: await entities.count(bookmark),
  }),
});

const noteMetadata = z.object({
  title: z.string(),
  slug: z.string(),
  publishedAt: z.string().optional(),
});
type SyndicatedNote = EntityOf<
  EntityDefinition<"syndicated-note", typeof noteMetadata>
>;

// A production feed leaves out a note without a publication date; a
// preview dates it by when it was written.
function noteItem(
  note: SyndicatedNote,
  { environment }: EntityFeedBuild,
): FeedItem | null {
  const publishedAt =
    note.metadata.publishedAt ??
    (environment === "preview" ? note.created : undefined);
  return publishedAt === undefined
    ? null
    : {
        title: note.metadata.title,
        slug: note.metadata.slug,
        description: note.content.slice(0, 160),
        content: note.content,
        author: "The reader",
        publishedAt,
      };
}

const noteFeed: EntityFeedDeclaration<SyndicatedNote> = {
  path: "notes.xml",
  title: "Notes",
  toItem: noteItem,
};

export const syndicatedNote = defineEntity({
  type: "syndicated-note",
  purpose: "A short note the site syndicates.",
  metadata: noteMetadata,
  templates: {
    "reading-list": {
      name: "reading-list",
      description: "Saved page titles",
      schema: z.object({ titles: z.array(z.string()) }),
      requiredPermission: "public",
      dataSourceId: "reading-list",
    },
  },
  feed: noteFeed,
});

// Data sources belong to the package: every definition they read exists by
// then, and their ids are scoped to the package.
export const readingShelf = defineEntityPackage({
  id: "reading-shelf",
  entities: [bookmark, syndicatedNote],
  dataSources: [readingList, bookmarkShelf],
});

export const invalidReader = defineDataSource({
  id: "invalid-reader",
  name: "Invalid reader",
  description: "Compile-only rejection",
  fetch: async (_query, entities, context) => {
    function unsupported(): void {
      // @ts-expect-error Build metadata is read-only, not an authority setter.
      context.publishedOnly = false;
      // @ts-expect-error A data source reads; it never writes.
      void entities.upsert;
    }
    void unsupported;
    return {};
  },
});

export const invalidTransform = defineDataSource({
  id: "invalid-transform",
  name: "Invalid transform",
  description: "Compile-only rejection",
  entity: bookmark,
  defaultSort: [{ field: "title", direction: "asc" }],
  // @ts-expect-error A transform reads the declared type, not another type's fields.
  transform: (entry) => entry.metadata.wordCount,
  list: (items) => ({ counts: [...items] }),
});

export const invalidFilter = defineDataSource<typeof bookmark, string, Titles>({
  id: "invalid-filter",
  name: "Invalid filter",
  description: "Compile-only rejection",
  entity: bookmark,
  defaultSort: [{ field: "title", direction: "asc" }],
  // @ts-expect-error A filter matches the declared type's own metadata.
  filter: () => ({ metadata: { wordCount: 3 } }),
  transform: (entry) => entry.metadata.title,
  list: (items) => ({ titles: [...items] }),
});

export const invalidBaseFields = defineDataSource({
  id: "invalid-base-fields",
  name: "Invalid base fields",
  description: "Compile-only rejection",
  entity: bookmark,
  // @ts-expect-error The runtime derives the entity schema; authors never declare base fields.
  entitySchema: z.object({ id: z.string(), content: z.string() }),
  defaultSort: [{ field: "title", direction: "asc" }],
  transform: (entry): string => entry.metadata.title,
  list: (items): Titles => ({ titles: [...items] }),
});

export const invalidEntity = defineDataSource<typeof bookmark, string, Titles>({
  id: "invalid-entity",
  name: "Invalid entity",
  description: "Compile-only rejection",
  // @ts-expect-error A data source reads a declared definition, not a type name.
  entity: "bookmark",
  defaultSort: [{ field: "title", direction: "asc" }],
  transform: (): string => "",
  list: (items): Titles => ({ titles: [...items] }),
});

export const invalidFeedItem: EntityFeedDeclaration<SyndicatedNote> = {
  path: "invalid.xml",
  // @ts-expect-error A feed item names its title, slug and publication date.
  toItem: (note) => ({ title: note.metadata.title }),
};
