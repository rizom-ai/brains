import {
  defineEntity,
  defineEntityPackage,
  defineProjection,
  z,
  type EntityOf,
} from "@rizom/brain/entities";

export const bookmark = defineEntity({
  type: "bookmark",
  purpose: "A saved page in the reader's library.",
  metadata: z.object({
    url: z.url(),
    title: z.string(),
    tags: z.array(z.string()).default([]),
  }),
});

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

export default defineEntityPackage({
  id: "reading-library",
  entities: [bookmark, readingDigest],
  projections: [bookmarkDigest],
});
