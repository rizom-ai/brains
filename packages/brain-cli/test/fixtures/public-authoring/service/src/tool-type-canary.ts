import { defineServicePlugin, defineTool, z } from "@rizom/brain/services";

const verdict = z.object({
  status: z.enum(["open", "done"]),
  tags: z.array(z.enum(["urgent", "later"])),
});

// Included by the standalone/packed consumer typecheck, not loaded by the brain.
export const toolTypeCanary = defineServicePlugin(
  { id: "tool-canary", config: z.object({}) },
  {
    tools: () => [
      // Written inline, a returned literal keeps its type, from a callback
      // that takes no parameters as well as from one that does.
      defineTool({
        name: "no-parameters",
        description: "Returns literals without reading its input",
        input: z.object({}),
        output: verdict,
        execute: () => ({ status: "open", tags: ["urgent"] }),
      }),
      defineTool({
        name: "async-no-parameters",
        description: "Returns literals asynchronously",
        input: z.object({}),
        output: verdict,
        execute: async () => ({ status: "done", tags: [] }),
      }),
      defineTool({
        name: "with-parameters",
        description: "Chooses a literal from its input",
        input: z.object({ finished: z.boolean() }),
        output: verdict,
        execute: ({ input }) => ({
          status: input.finished ? "done" : "open",
          tags: ["later"],
        }),
      }),
      defineTool({
        name: "async-with-parameters",
        description: "Chooses a literal from its input asynchronously",
        input: z.object({ finished: z.boolean() }),
        output: verdict,
        async execute({ input }) {
          return { status: input.finished ? "done" : "open", tags: [] };
        },
      }),
      // A known TypeScript limitation, pinned so a release that lifts it fails
      // here and the case can become a positive: an array literal under a
      // conditional widens to string[] before the schema can type it.
      defineTool({
        name: "conditional-array",
        description: "Refused today: chooses an array under a conditional",
        input: z.object({ finished: z.boolean() }),
        output: verdict,
        execute: ({ input }) => ({
          status: "open",
          // @ts-expect-error An array literal under a conditional widens.
          tags: input.finished ? [] : ["later"],
        }),
      }),
      // Choosing between whole literals keeps them, as does returning each.
      defineTool({
        name: "chosen-objects",
        description: "Chooses between whole literals",
        input: z.object({ finished: z.boolean() }),
        output: verdict,
        execute: ({ input }) =>
          input.finished
            ? { status: "done", tags: [] }
            : { status: "open", tags: ["later"] },
      }),
      defineTool({
        name: "separate-returns",
        description: "Returns each literal on its own",
        input: z.object({ finished: z.boolean() }),
        output: verdict,
        execute: ({ input }) => {
          if (input.finished) return { status: "done", tags: [] };
          return { status: "open", tags: ["later"] };
        },
      }),
      // A confirmation may describe the input it is asked to approve.
      defineTool({
        name: "confirm-from-input",
        description: "Closes a named item after approval",
        input: z.object({ item: z.string() }),
        output: z.object({ closed: z.string() }),
        confirmation: ({ item }) => `Close ${item}?`,
        execute: ({ input }) => ({ closed: input.item }),
      }),
      defineTool({
        name: "wrong-literal",
        description: "Refused: a literal the schema does not allow",
        input: z.object({}),
        output: verdict,
        // @ts-expect-error The status is not one the output schema allows.
        execute: () => ({ status: "later", tags: [] }),
      }),
      defineTool({
        name: "wrong-async-literal",
        description: "Refused: an async literal the schema does not allow",
        input: z.object({}),
        output: verdict,
        // @ts-expect-error A tag is not one the output schema allows.
        execute: async () => ({ status: "open", tags: ["someday"] }),
      }),
      defineTool({
        name: "wrong-confirmation",
        description: "Refused: a confirmation reading a field the input lacks",
        input: z.object({ item: z.string() }),
        output: z.object({}),
        // @ts-expect-error The confirmation reads the parsed input.
        confirmation: ({ missing }) => `Close ${missing}?`,
        execute: () => ({}),
      }),
    ],
  },
);
