import { defineCollection } from "astro:content";
import { landingPageSchema } from "@brains/types";

const landingCollection = defineCollection({
  type: "data",
  schema: landingPageSchema,
});

export const collections = {
  landing: landingCollection,
};
