import { bookmark, readingDigest } from "@fixture/reading-entities";
import {
  defineServicePlugin,
  defineTool,
  contentGenerationResultSchema,
  z,
} from "@rizom/brain/services";

// Included by the standalone/packed consumer typecheck, not loaded by the brain.
// Target construction checks types; these foreign definitions do not grant write ownership.
export const generationTypeCanary = defineServicePlugin(
  {
    id: "generation-type-canary",
    config: z.object({}),
  },
  {
    templates: {
      generated: {
        schema: z.object({ body: z.string() }),
        generation: { prompt: "Write" },
        format: ({ value }) => value.body,
      },
      formatted: { schema: z.string(), format: ({ value }) => value },
    },
    tools: ({ content }) => {
      const digest = content.target({
        template: "generated",
        destination: {
          entity: readingDigest,
          idPath: ["book", "digest"],
          metadata: { bookmarkId: "book", title: "Digest", wordCount: 0 },
        },
      });
      const overview = content.target({
        template: "generated",
        destination: {
          entity: bookmark,
          idPath: ["book", "overview"],
          metadata: { url: "https://example.test", title: "Overview" },
        },
      });
      const rejectedInputs = (): void => {
        content.target({
          // @ts-expect-error Unknown keys cannot widen the declaring service's templates.
          template: "unknown",
          destination: {
            entity: readingDigest,
            idPath: ["digest"],
            metadata: { bookmarkId: "book", title: "Digest", wordCount: 0 },
          },
        });
        content.target({
          // @ts-expect-error Format-only templates are not generation templates.
          template: "formatted",
          destination: {
            entity: readingDigest,
            idPath: ["digest"],
            metadata: { bookmarkId: "book", title: "Digest", wordCount: 0 },
          },
        });
        content.target({
          template: "generated",
          destination: {
            entity: readingDigest,
            idPath: ["digest"],
            // @ts-expect-error Each entity determines its own required metadata.
            metadata: { title: "Digest" },
          },
        });
        content.target({
          template: "generated",
          destination: {
            entity: readingDigest,
            idPath: ["digest"],
            // @ts-expect-error Metadata from a bookmark cannot widen the digest definition.
            metadata: { url: "https://example.test", title: "Overview" },
          },
        });
        void content.generate({
          targets: [
            // @ts-expect-error Unchecked objects are not checked targets; only content.target() carries the brand.
            {
              templateName: "generated",
              context: {},
              destination: {
                entityType: "reading-digest",
                idPath: ["digest"],
                metadata: {},
              },
            },
          ],
        });
      };
      void rejectedInputs;
      return [
        defineTool({
          name: "generate",
          description: "Typed heterogeneous batch",
          input: z.object({}),
          output: contentGenerationResultSchema,
          sideEffects: "writes",
          execute: () =>
            content.generate({ targets: [digest, overview], dryRun: true }),
        }),
      ];
    },
  },
);
