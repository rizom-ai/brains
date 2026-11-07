import {
  SdkError,
  defineInterface,
  defineRoute,
  z,
} from "@rizom/brain/interfaces";

const verdict = z.object({
  status: z.enum(["open", "done"]),
  tags: z.array(z.enum(["urgent", "later"])),
});
const finished = z.object({ finished: z.boolean() });

// Included by the standalone/packed consumer typecheck, not loaded by the brain.
export const routeAnswerTypeCanary = defineInterface(
  { id: "route-answer-canary", config: z.object({}) },
  {
    routes: () => [
      // Written inline, an answer keeps its literal types, from a handler that
      // takes no parameters as well as from one that does.
      defineRoute({
        method: "GET",
        path: "/route-answer-canary/no-parameters",
        security: { kind: "public" },
        response: verdict,
        handle: () => ({ status: "open", tags: ["urgent"] }),
      }),
      defineRoute({
        method: "GET",
        path: "/route-answer-canary/async-no-parameters",
        security: { kind: "public" },
        response: verdict,
        handle: async () => ({ status: "done", tags: [] }),
      }),
      defineRoute({
        method: "POST",
        path: "/route-answer-canary/with-parameters",
        security: { kind: "public" },
        body: finished,
        response: verdict,
        handle: ({ body }) => ({
          status: body.finished ? "done" : "open",
          tags: ["later"],
        }),
      }),
      defineRoute({
        method: "POST",
        path: "/route-answer-canary/async-with-parameters",
        security: { kind: "public" },
        body: finished,
        response: verdict,
        async handle({ body }) {
          return { status: body.finished ? "done" : "open", tags: [] };
        },
      }),
      // A known TypeScript limitation, pinned so a release that lifts it fails
      // here and the case can become a positive: an array literal under a
      // conditional widens to string[] before the schema can type it.
      defineRoute({
        method: "POST",
        path: "/route-answer-canary/conditional-array",
        security: { kind: "public" },
        body: finished,
        response: verdict,
        handle: ({ body }) => ({
          status: "open",
          // @ts-expect-error An array literal under a conditional widens.
          tags: body.finished ? [] : ["later"],
        }),
      }),
      // Choosing between whole literals keeps them, as does returning each.
      defineRoute({
        method: "POST",
        path: "/route-answer-canary/chosen-objects",
        security: { kind: "public" },
        body: finished,
        response: verdict,
        handle: ({ body }) =>
          body.finished
            ? { status: "done", tags: [] }
            : { status: "open", tags: ["later"] },
      }),
      defineRoute({
        method: "POST",
        path: "/route-answer-canary/separate-returns",
        security: { kind: "public" },
        body: finished,
        response: verdict,
        handle: ({ body }) => {
          if (body.finished) return { status: "done", tags: [] };
          return { status: "open", tags: ["later"] };
        },
      }),
      // A coded failure is answered in its public form, with its status.
      defineRoute({
        method: "GET",
        path: "/route-answer-canary/refused",
        security: { kind: "public" },
        response: verdict,
        handle: () => {
          throw new SdkError("not_found", { publicMessage: "No verdict yet" });
        },
      }),
      defineRoute({
        method: "GET",
        path: "/route-answer-canary/wrong-literal",
        security: { kind: "public" },
        response: verdict,
        // @ts-expect-error The status is not one the response schema allows.
        handle: () => ({ status: "later", tags: [] }),
      }),
      defineRoute({
        method: "GET",
        path: "/route-answer-canary/wrong-async-literal",
        security: { kind: "public" },
        response: verdict,
        // @ts-expect-error A tag is not one the response schema allows.
        handle: async () => ({ status: "open", tags: ["someday"] }),
      }),
      defineRoute({
        method: "GET",
        path: "/route-answer-canary/missing-field",
        security: { kind: "public" },
        response: verdict,
        // @ts-expect-error An answer must carry every field the schema requires.
        handle: () => ({ status: "open" }),
      }),
    ],
  },
);
