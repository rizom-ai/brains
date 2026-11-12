import {
  defineDataSource,
  defineEntity,
  defineEntityJob,
  defineEntityPackage,
  defineProjection,
  z,
  type EntityOf,
  type EntityPackageConfiguration,
} from "@rizom/brain/entities";

// Export definitions when another package needs typed entity access.
export const bookmark = defineEntity({
  type: "bookmark",
  purpose: "A saved page in the reader's library.",
  metadata: z.object({
    url: z.url(),
    title: z.string(),
    tags: z.array(z.string()).default([]),
  }),
});

// EntityOf adds the runtime-managed identity, content, visibility, and timestamps.
export type Bookmark = EntityOf<typeof bookmark>;

export const readingDigest = defineEntity({
  type: "reading-digest",
  purpose: "A deterministic digest derived from a saved page.",
  metadata: z.object({
    bookmarkId: z.string(),
    title: z.string(),
    wordCount: z.number().int().nonnegative(),
  }),
});

export type ReadingDigest = EntityOf<typeof readingDigest>;

// Projections connect definitions directly; target writes are type-safe.
const bookmarkDigest = defineProjection({
  id: "bookmark-digest",
  source: bookmark,
  target: readingDigest,
  async project({ source, target }) {
    const wordCount = source.content.split(/\s+/u).filter(Boolean).length;

    await target.upsert({
      id: source.id,
      content: `${source.metadata.title}\n\n${source.content}`,
      visibility: source.visibility,
      metadata: {
        bookmarkId: source.id,
        title: source.metadata.title,
        wordCount,
      },
    });
  },
});

// A package's settings, which use() and a brain's config give it; every
// one has a default, so use(readingLibrary) needs no config object.
const readingLibraryConfig = z.object({
  shelfTitle: z.string().default("Reading list"),
  digestRefusal: z
    .string()
    .default("Reading digests are derived from saved pages."),
  // A token for the reader's archive, which a provider and a job read.
  archiveToken: z.string().default(""),
});

// What reads the settings is bound once per instantiation, with the parsed
// config: a data source, an entity's create route, and the publish provider
// and job that reach the reader's archive with its token.
function configureReadingLibrary({
  config,
}: {
  readonly config: z.output<typeof readingLibraryConfig>;
}): EntityPackageConfiguration<
  readonly [typeof bookmark, typeof readingDigest]
> {
  return {
    dataSources: [
      defineDataSource({
        id: "shelf",
        name: "Reading shelf",
        description: "The shelf title and how many pages it holds",
        fetch: async (_query, entities) => ({
          title: config.shelfTitle,
          count: await entities.count(bookmark),
        }),
      }),
    ],
    entities: [
      {
        entity: bookmark,
        publish: {
          provider: {
            name: "reading-archive",
            publish: async (): Promise<{ id: string }> => ({
              id: config.archiveToken ? "archived" : "kept-local",
            }),
          },
        },
        jobs: {
          archive: defineEntityJob({
            input: z.object({ url: z.url() }),
            handle: async ({ input }) => ({
              url: input.url,
              signed: config.archiveToken.length > 0,
            }),
          }),
        },
      },
      {
        entity: readingDigest,
        create: {
          fromContent: {
            resolve: async () => ({ refuse: config.digestRefusal }),
          },
        },
      },
    ],
  };
}

// This package declares no templates; the presentation canary shows an
// entity's templates and feed. One default package definition is the
// loader-facing contract.
export default defineEntityPackage({
  id: "reading-library",
  config: readingLibraryConfig,
  entities: [bookmark, readingDigest],
  projections: [bookmarkDigest],
  configure: configureReadingLibrary,
});
