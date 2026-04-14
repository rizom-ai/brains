import { createTemplate } from "@brains/templates";
import { PullQuoteContentSchema, type PullQuoteContent } from "./schema";
import { PullQuoteLayout } from "./layout";
import { pullQuoteFormatter } from "./formatter";

export const pullQuoteTemplate = createTemplate<PullQuoteContent>({
  name: "pull-quote",
  description: "Rizom pull-quote section — centered editorial quote block",
  schema: PullQuoteContentSchema,
  formatter: pullQuoteFormatter,
  requiredPermission: "public",
  layout: { component: PullQuoteLayout },
});
