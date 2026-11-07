import { fillReaderProfile, readerProfile } from "@fixture/reader-profile";
import {
  SdkError,
  defineServicePlugin,
  defineTool,
  z,
} from "@rizom/brain/services";

const importResult = z.object({
  filled: z.array(z.string()),
  kept: z.array(z.string()),
});

// An importer fills the reader's profile from an outside source. It does not
// steward the profile, so it asks the package that does.
export default defineServicePlugin(
  { id: "reader-import", config: z.object({}) },
  {
    tools: ({ entities, messaging }) => [
      defineTool({
        name: "import-profile",
        description: "Fill the reader's profile from an imported one.",
        input: z.object({
          headline: z.string().optional(),
          website: z.string().optional(),
        }),
        output: importResult,
        sideEffects: "writes",
        async execute({ input }) {
          const asked = await messaging.request(fillReaderProfile, {
            fields: input,
          });
          if (asked.status === "answered") return asked.data;
          // The steward's refusal reaches the caller with its code.
          throw new SdkError(
            asked.status === "failed" ? asked.error.code : "no_handler",
            asked.status === "failed"
              ? { publicMessage: asked.error.message }
              : {},
          );
        },
      }),
      defineTool({
        name: "profile-headline",
        description: "Read the reader's headline; reading needs no steward.",
        input: z.object({}),
        output: z.object({ headline: z.string().nullable() }),
        sideEffects: "none",
        async execute() {
          const profile = await entities.get(readerProfile, "reader-profile");
          return { headline: profile?.metadata.headline ?? null };
        },
      }),
    ],
  },
);

// Included by the standalone/packed consumer typecheck, not loaded by the brain.
export const directWriteCanary = defineServicePlugin(
  { id: "direct-write-canary", config: z.object({}) },
  {
    tools: ({ entities }) => [
      defineTool({
        name: "take-over",
        description: "Refused: writes a type another package stewards.",
        input: z.object({}),
        output: z.object({}),
        async execute() {
          const profile = await entities.get(readerProfile, "reader-profile");
          if (profile) {
            // @ts-expect-error Only the steward writes the reader profile.
            await entities.update(readerProfile, profile, {
              metadata: { ...profile.metadata, headline: "Taken over" },
            });
          }
          return {};
        },
      }),
    ],
  },
);
