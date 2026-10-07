import {
  defineEntity,
  frontmatterInContent,
  type EntityDefinition,
} from "@brains/sdk/entities";
import {
  NETWORK_PIECE_ENTITY_TYPE,
  networkPieceFrontmatterSchema,
} from "./schemas/network-piece";
export const networkPiece: EntityDefinition<
  typeof NETWORK_PIECE_ENTITY_TYPE,
  typeof networkPieceFrontmatterSchema
> = defineEntity({
  type: NETWORK_PIECE_ENTITY_TYPE,
  classification: "content",
  purpose:
    "Another brain's published record, kept here to answer visitors and cited to that brain.",
  metadata: networkPieceFrontmatterSchema,
  markdown: frontmatterInContent((raw) =>
    networkPieceFrontmatterSchema.parse(raw),
  ),
  config: {
    embeddable: true,
    fullTextSearchable: true,
    includeInBroadSearch: true,
    projectionSource: false,
    projectionSourceRole: "excluded",
    publish: { publishStatuses: ["published"] },
    actionPolicy: {
      create: "never",
      update: "never",
      delete: "never",
      extract: "never",
      publish: "never",
    },
  },
});
