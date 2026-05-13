import { StructuredContentFormatter } from "@brains/content-formatters";
import { linkListSchema, type LinkListData } from "./schema";

export class LinkListFormatter extends StructuredContentFormatter<LinkListData> {
  constructor() {
    super(linkListSchema, {
      title: "Link Collection",
      mappings: [
        {
          key: "links",
          label: "Links",
          type: "array",
          itemType: "object",
        },
        {
          key: "totalCount",
          label: "Total Count",
          type: "number",
        },
      ],
    });
  }
}
