import { defineCollection, z } from 'astro:content';

const landingCollection = defineCollection({
  type: 'data',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    stats: z.object({
      noteCount: z.number(),
      tagCount: z.number(),
      lastUpdated: z.string(),
    }),
    recentNotes: z.array(z.object({
      id: z.string(),
      title: z.string(),
      created: z.string(),
    })),
  }),
});

export const collections = {
  landing: landingCollection,
};