import { defineEntity, z, type EntityDefinition } from "@brains/sdk/entities";
import {
  storedDocumentCodec,
  withFrontmatterSchema,
  writesInDocumentOrder,
} from "@brains/sdk/internal/entity-runtime";
import {
  GROUPING_DEFINITIONS_TYPE,
  groupingDefinitionsFrontmatterSchema,
} from "../grouping-definitions-contract";

const metadataSchema: z.ZodObject = z.object({});

/**
 * The brain's one grouping definitions document: the grouping names an
 * admin authored, the types each takes part in, its cardinality and its
 * allowed values. Studio owns it and validates it when it is written; a
 * read hands back the whole document, and one that needs repair still
 * reads as written, as the class's adapter read it. It indexes nothing.
 */
export const groupingDefinitionsEntity: EntityDefinition<
  typeof GROUPING_DEFINITIONS_TYPE,
  typeof metadataSchema
> = withFrontmatterSchema(
  writesInDocumentOrder(
    defineEntity({
      type: GROUPING_DEFINITIONS_TYPE,
      purpose:
        "Admin-authored grouping names, participating types, cardinality and optional allowed values.",
      classification: "system",
      singleton: true,
      hasBody: false,
      metadata: metadataSchema,
      // Read as written: any header, even one that does not parse, so a
      // document awaiting repair is still read, byte for byte.
      markdown: storedDocumentCodec({
        header: z.looseObject({}),
        deriveMetadata: () => ({}),
        readAsWritten: true,
      }),
      config: {
        embeddable: false,
        projectionSource: false,
        actionPolicy: {
          create: "admin",
          update: "admin",
          delete: "admin",
          publish: "never",
        },
      },
    }),
  ),
  groupingDefinitionsFrontmatterSchema,
);
