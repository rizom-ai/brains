/** Note entity and its owned, restricted text-capture service. */
import {
  defineServicePlugin,
  defineSubscription,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import {
  NOTE_CAPTURE_MESSAGE,
  noteCaptureRequestSchema,
  noteCaptureResponseSchema,
} from "@brains/contracts";
import { note } from "./note-entity";

const noteConfig: z.ZodObject<
  Record<string, never>,
  z.core.$strict
> = z.strictObject({});
export const notes: ServicePackageDefinition<typeof noteConfig> =
  defineServicePlugin(
    {
      id: "note-capture",
      config: noteConfig,
      entities: [note],
      setup: ({ entities }) => ({ entities }),
    },
    {
      subscriptions: ({ state }) => [
        defineSubscription({
          topic: NOTE_CAPTURE_MESSAGE,
          payload: noteCaptureRequestSchema,
          response: noteCaptureResponseSchema,
          handle: async ({ payload }) => {
            const saved = await state.entities.createPending({
              entityType: "note",
              id: payload.id,
              content: payload.body,
              metadata: { title: payload.title },
              visibility: "restricted",
            });
            return { noteId: saved.entityId, created: saved.created };
          },
        }),
      ],
    },
  );

export default notes;

export {
  buildNoteAtprotoRecord,
  createNoteAtprotoProjection,
} from "./atproto-projection";

export {
  noteSchema,
  noteFrontmatterSchema,
  noteMetadataSchema,
  noteWithDataSchema,
  type Note,
  type NoteFrontmatter,
  type NoteMetadata,
  type NoteStatus,
  type NoteWithData,
} from "./schemas/note";
