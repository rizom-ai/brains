import { defineEntity, z, type EntityDefinition } from "@brains/sdk/entities";
import {
  REFINED_FROM,
  refinedNoteGeneration,
  refinementPrompt,
} from "./generation";
import { refinedNoteMetadataSchema } from "./schemas/refined-note";
import {
  refinedNoteGenerationSchema,
  refinedNoteTemplate,
} from "./templates/refinement-template";

const REFINED_NOTE_INSTRUCTIONS =
  'A refined note is a worked-out note written from one or more plain notes, which it replaces: once it is saved, those notes are removed. To refine, escalate, work out or consolidate notes, call system_generate with operation.kind prompt-from-source, entityType "refined-note" and the note as source; to refine several notes into one, name the first as source and the others in additionalSourceIds, in one call. Pass the user\'s direction as prompt and a title only when they give one: the refined note is titled from what is written. The confirmation says which notes will be removed. Never refine notes the user did not name, and never generate a refined note from a prompt alone. A refined note cannot be refined again.';

/** What the refinement eval is given: the loose notes' text, and a direction. */
const refineNotesEvalInput = z.object({
  notes: z.array(z.string().min(1)).min(1),
  direction: z.string().optional(),
});

type RefinedNoteDefinition = EntityDefinition<
  "refined-note",
  typeof refinedNoteMetadataSchema
>;

/**
 * The second level of notes: one worked-out note written from one or more
 * plain notes. It states its title and a one-sentence summary, lives in its
 * own folder, and uses up the notes it was written from.
 */
export const refinedNote: RefinedNoteDefinition = defineEntity({
  type: "refined-note",
  purpose:
    "A worked-out note written from one or more plain notes, which it replaces.",
  metadata: refinedNoteMetadataSchema,
  config: {
    projectionSourceRole: "primary",
    consumesSources: [REFINED_FROM],
    requiresGroupingMembership: true,
  },
  instructions: REFINED_NOTE_INSTRUCTIONS,
  stub: ({ title }) => ({
    content: "",
    metadata: { title, summary: "", status: "generating" },
  }),
  templates: { refinement: refinedNoteTemplate },
  generation: refinedNoteGeneration,
  evals: {
    refineNotes: async (input, { ai }) => {
      const { notes, direction } = refineNotesEvalInput.parse(input);
      return ai.generate(
        {
          template: "refinement",
          prompt: refinementPrompt(notes, direction),
          representedIdentity: "none",
        },
        refinedNoteGenerationSchema,
      );
    },
  },
});
