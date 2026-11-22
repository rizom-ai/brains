import { bodyFields, type FieldMapping } from "@brains/content-formatters";
import { guideFrontmatterSchema } from "./guide-frontmatter";

// Kept free of plugin imports, as the frontmatter schema is: the docs sync
// script writes guide sources in their stored form through the package's
// `./stored-form` export.

/** The fields a guide's stored form (docs/external-plugin-authoring.md, The stored format) states in its body. */
export const GUIDE_BODY_FIELDS: readonly string[] = ["for", "material"];

/** Who a guide is for, and one heading per source of its material. */
export const guideBodyMappings: FieldMapping[] = [
  { key: "for", label: "For", type: "string" },
  {
    key: "material",
    label: "Material",
    type: "array",
    itemType: "object",
    itemTitle: "from",
    itemMappings: [
      { key: "from", label: "From", type: "string" },
      { key: "where", label: "Where", type: "string", line: true },
      { key: "becomes", label: "Becomes", type: "string", line: true },
      { key: "how", label: "How", type: "string", line: true },
    ],
  },
];

/** A guide's body fields: above the guide's own sections. */
export const guideBody: ReturnType<typeof bodyFields> = bodyFields(
  guideFrontmatterSchema,
  GUIDE_BODY_FIELDS,
  { mappings: guideBodyMappings, place: "above" },
);
