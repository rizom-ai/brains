import { defineCollection } from "astro:content";
import { landingPageSchema, dashboardSchema } from "../schemas";

const landingCollection = defineCollection({
  type: "data",
  schema: landingPageSchema,
});

const dashboardCollection = defineCollection({
  type: "data",
  schema: dashboardSchema,
});

export const collections = {
  landing: landingCollection,
  dashboard: dashboardCollection,
};
