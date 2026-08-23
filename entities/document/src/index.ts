/**
 * Document package.
 *
 * One entity: a durable file artifact the brain keeps. Both ways of getting
 * one — preserving an upload, rendering another entity's attachment — go
 * through the create route, and the slow half of the second is a job the
 * runtime allocated the entity for first.
 */

import {
  defineEntityPackage,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import { document } from "./document-entity";

export const documents: EntityPackageDefinition = defineEntityPackage({
  id: "document",
  entities: [document],
});

export default documents;

export { document } from "./document-entity";

export {
  documentMetadataSchema,
  documentSchema,
  type DocumentEntity,
  type DocumentMetadata,
} from "@brains/document";
