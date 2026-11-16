import {
  defineEntityPackage,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import { refinedNote } from "./refined-note";

/**
 * The refined notes: one entity, a worked-out note written from one or more
 * plain notes, which it replaces.
 */
export const refinedNotePackage: EntityPackageDefinition<
  readonly [typeof refinedNote]
> = defineEntityPackage({
  id: "refined-note",
  entities: [refinedNote],
});

export default refinedNotePackage;

export { refinedNote } from "./refined-note";
export {
  refinedNoteMetadataSchema,
  refinedNoteStatusSchema,
  type RefinedNoteMetadata,
  type RefinedNoteStatus,
} from "./schemas/refined-note";
export {
  REFINED_FROM,
  refinedNoteGeneration,
  refinedNoteGenerationJobSchema,
  type RefinedNoteGenerationJobData,
} from "./generation";
export {
  refinedNoteGenerationSchema,
  refinedNoteTemplate,
  type RefinedNoteGeneration,
} from "./templates/refinement-template";
