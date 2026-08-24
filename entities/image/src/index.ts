/**
 * Image package.
 *
 * One entity, four ways of getting one: generated from a prompt, rendered
 * from another entity's attachment, handed over as bytes, or preserved from
 * an upload. All four go through the create route; the two slow ones
 * delegate to a job the runtime allocated the entity for first.
 */

import {
  defineEntityPackage,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import { image } from "./image-entity";

export const images: EntityPackageDefinition = defineEntityPackage({
  id: "image",
  entities: [image],
});

export default images;

export { image } from "./image-entity";

export {
  imageMetadataSchema,
  imageSchema,
  type Image,
  type ImageMetadata,
} from "@brains/image";
