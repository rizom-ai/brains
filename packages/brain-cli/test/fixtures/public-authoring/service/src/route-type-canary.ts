import {
  defineJob,
  defineRoute,
  defineServicePlugin,
  protocol,
  z,
} from "@rizom/brain/services";

const remind = defineJob({
  name: "remind",
  input: z.object({ id: z.string() }),
  output: z.object({ id: z.string() }),
});

// Included by the standalone/packed consumer typecheck, not loaded by the brain.
export const routeTypeCanary = defineServicePlugin(
  {
    id: "route-canary",
    config: z.object({ token: z.string() }),
    setup: () => ({ greeting: "Hello" }),
  },
  {
    jobs: () => [remind.handle(async ({ input }) => input)],
    // The slot carries the capabilities; a route's handler is given the call.
    routes: ({ config, state, jobs }) => [
      defineRoute({
        method: "GET",
        path: "/route-canary/health",
        security: { kind: "public" },
        response: z.object({ greeting: z.string() }),
        handle: ({ caller }) => {
          // A public route has no caller.
          const nobody: null = caller;
          void nobody;
          return { greeting: state.greeting };
        },
      }),
      defineRoute({
        method: "POST",
        path: "/route-canary/remind",
        security: protocol({
          authenticate: ({ request }) =>
            request.headers.get("authorization") === config.token
              ? { id: "signed" }
              : null,
        }),
        body: remind.input,
        response: z.object({ jobId: z.string(), permission: z.string() }),
        async handle({ body, caller }) {
          const id: string = body.id;
          const job = await jobs.enqueue(remind, { id });
          return { jobId: job.id, permission: caller.permission };
        },
      }),
      defineRoute({
        method: "GET",
        path: "/route-canary/no-entities",
        security: { kind: "public" },
        response: z.object({}),
        // @ts-expect-error A route's handler is given no entity access.
        handle: ({ entities }) => {
          void entities;
          return {};
        },
      }),
    ],
  },
);
