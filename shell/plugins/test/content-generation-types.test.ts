import { expect, expectTypeOf, test } from "bun:test";
import {
  defineEntity,
  defineServicePlugin,
  defineTool,
  contentGenerationResultSchema,
} from "../src";
import { z } from "@brains/utils/zod";

const chapter = defineEntity({
  type: "chapter",
  purpose: "Chapter",
  metadata: z.object({ bookId: z.string(), title: z.string() }),
});
const summary = defineEntity({
  type: "summary",
  purpose: "Summary",
  metadata: z.object({
    audience: z.string(),
    edition: z.number(),
  }),
});

test("generation targets infer each entity independently and only permit generation templates", () => {
  const definition = defineServicePlugin(
    {
      id: "typed-content",
      config: z.object({}),
    },
    {
      templates: {
        chapter: {
          schema: z.object({ body: z.string() }),
          generation: { prompt: "Write chapter" },
          format: ({ value }) => {
            expectTypeOf(value).toEqualTypeOf<{ body: string }>();
            return value.body;
          },
        },
        summary: {
          schema: z.object({ count: z.number() }),
          generation: { prompt: "Write summary" },
          format: ({ value }) => {
            expectTypeOf(value).toEqualTypeOf<{ count: number }>();
            return String(value.count);
          },
        },
        formatOnly: {
          schema: z.string(),
          format: ({ value }) => {
            expectTypeOf(value).toEqualTypeOf<string>();
            return value;
          },
        },
      },
      tools: ({ content }) => {
        const first = content.target({
          template: "chapter",
          destination: {
            entity: chapter,
            idPath: ["intro"],
            metadata: { bookId: "book", title: "Intro" },
          },
        });
        const second = content.target({
          template: "summary",
          destination: {
            entity: summary,
            idPath: ["book", "summary"],
            metadata: { audience: "beginner", edition: 2 },
          },
        });
        // Checked by the package typecheck, never invoked during registration.
        const rejectedInputs = (): void => {
          content.target({
            // @ts-expect-error A name in tools cannot widen the declared template keys.
            template: "missing",
            destination: {
              entity: chapter,
              idPath: ["intro"],
              metadata: { bookId: "book", title: "Intro" },
            },
          });
          content.target({
            // @ts-expect-error Format-only templates are not generation targets.
            template: "formatOnly",
            destination: {
              entity: chapter,
              idPath: ["intro"],
              metadata: { bookId: "book", title: "Intro" },
            },
          });
          content.target({
            template: "chapter",
            destination: {
              entity: chapter,
              idPath: ["intro"],
              // @ts-expect-error Metadata cannot widen the independently inferred chapter definition.
              metadata: { audience: "beginner", edition: "2" },
            },
          });
          content.target({
            template: "chapter",
            destination: {
              entity: chapter,
              idPath: ["intro"],
              // @ts-expect-error Required chapter metadata is missing.
              metadata: { title: "Intro" },
            },
          });
          content.target({
            template: "summary",
            destination: {
              entity: summary,
              idPath: ["summary"],
              // @ts-expect-error Persisted metadata must match the canonical entity schema.
              metadata: { audience: "beginner", edition: "2" },
            },
          });
          content.target({
            template: "chapter",
            destination: {
              entity: chapter,
              // @ts-expect-error Public paths are segment arrays, not storage identifiers.
              idPath: "book:intro",
              metadata: { bookId: "book", title: "Intro" },
            },
          });
          content.target({
            template: "chapter",
            destination: {
              entity: chapter,
              // @ts-expect-error Empty paths are not destinations.
              idPath: [],
              metadata: { bookId: "book", title: "Intro" },
            },
          });
          void content.generate({
            targets: [
              // @ts-expect-error Unchecked raw objects cannot be submitted; only checked targets carry the brand.
              {
                templateName: "chapter",
                context: {},
                destination: {
                  entityType: "chapter",
                  idPath: ["intro"],
                  metadata: {},
                },
              },
            ],
          });
          // A checked target is plain validated JSON: the definition is not on it.
          expectTypeOf(first.destination).not.toHaveProperty("entity");
        };
        expectTypeOf(rejectedInputs).toBeFunction();
        return [
          defineTool({
            name: "generate",
            description: "Generate mixed targets",
            input: z.object({}),
            output: contentGenerationResultSchema,
            sideEffects: "writes",
            execute: () => content.generate({ targets: [first, second] }),
          }),
        ];
      },
    },
  );
  expect(definition).toBeDefined();
});

test("a service with no templates cannot infer generation keys from target use", () => {
  const definition = defineServicePlugin(
    {
      id: "no-templates",
      config: z.object({}),
    },
    {
      tools: ({ content }) => {
        const rejectedInputs = (): void => {
          content.target({
            // @ts-expect-error No generation templates were declared.
            template: "chapter",
            destination: {
              entity: chapter,
              idPath: ["intro"],
              metadata: { bookId: "book", title: "Intro" },
            },
          });
        };
        expectTypeOf(rejectedInputs).toBeFunction();
        return [];
      },
    },
  );
  expect(definition).toBeDefined();
});
