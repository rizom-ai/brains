import { defineEntity } from "@rizom/brain/entities";
import {
  SdkError,
  defineBusContract,
  defineServicePlugin,
  defineTool,
  z,
} from "@rizom/brain/services";

// The reader's profile. This package stewards it: it owns the type, and it is
// the only package that writes it.
export const readerProfile = defineEntity({
  type: "reader-profile",
  purpose: "Who the reader is, as their brain presents them",
  metadata: z.object({
    name: z.string(),
    headline: z.string().optional(),
    website: z.string().optional(),
  }),
});

const importedFields = z.object({
  headline: z.string().optional(),
  website: z.string().optional(),
});
const fieldName = z.enum(["headline", "website"]);

// How another package asks for a change: an import fills what the reader left
// empty and keeps what they wrote. Named by this package, which answers it.
export const fillReaderProfile = defineBusContract({
  channel: "@fixture/reader-profile:fill",
  request: z.object({ fields: importedFields }),
  response: z.object({
    filled: z.array(fieldName),
    kept: z.array(fieldName),
  }),
  delivery: "request",
});

export default defineServicePlugin(
  {
    id: "profile",
    // The packages allowed to ask for an import, by the plugin they ask as.
    config: z.object({ importers: z.array(z.string()).default([]) }),
    entities: [readerProfile],
  },
  {
    subscriptions: ({ answer, config, entities }) => [
      answer(fillReaderProfile, async ({ request, sender }) => {
        // The steward authorizes by who asked and by what its contract allows.
        if (!config.importers.includes(sender)) {
          throw new SdkError("permission_denied", {
            publicMessage: `${sender} may not fill the reader profile`,
          });
        }
        const profile = await entities.get(readerProfile, "reader-profile");
        if (!profile) {
          throw new SdkError("not_found", {
            publicMessage: "The reader has no profile yet",
          });
        }
        const offered = fieldName.options.filter(
          (field) => request.fields[field] !== undefined,
        );
        const filled = offered.filter((field) => !profile.metadata[field]);
        const kept = offered.filter((field) => profile.metadata[field]);
        if (filled.length > 0) {
          // What the reader wrote wins over what was imported.
          const headline = profile.metadata.headline ?? request.fields.headline;
          const website = profile.metadata.website ?? request.fields.website;
          await entities.update(readerProfile, profile, {
            metadata: {
              name: profile.metadata.name,
              ...(headline !== undefined && { headline }),
              ...(website !== undefined && { website }),
            },
          });
        }
        return { filled, kept };
      }),
    ],
    tools: ({ entities }) => [
      defineTool({
        name: "start-profile",
        description: "Start the reader's profile with their name.",
        input: z.object({ name: z.string() }),
        output: z.object({ id: z.string() }),
        sideEffects: "writes",
        execute: ({ input }) =>
          entities.create(readerProfile, {
            id: "reader-profile",
            content: "",
            metadata: { name: input.name },
            visibility: "public",
          }),
      }),
    ],
  },
);
