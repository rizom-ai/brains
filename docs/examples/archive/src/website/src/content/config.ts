import { defineCollection } from 'astro:content';

import { LandingPageSchema } from '../schemas';

// Landing page collection using our shared schema
const landingPageCollection = defineCollection({
  type: 'data',
  schema: LandingPageSchema,
});

// Export collections
export const collections = {
  'landingPage': landingPageCollection,
};
