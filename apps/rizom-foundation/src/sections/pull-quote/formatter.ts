import { StructuredContentFormatter } from "@brains/utils";
import { PullQuoteContentSchema, type PullQuoteContent } from "./schema";

export const pullQuoteFormatter =
  new StructuredContentFormatter<PullQuoteContent>(PullQuoteContentSchema, {
    title: "Pull Quote Section",
    mappings: [
      { key: "quote", label: "Quote", type: "string" },
      { key: "attribution", label: "Attribution", type: "string" },
    ],
  });
