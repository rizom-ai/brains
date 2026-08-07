import { compileReadingDigest } from "@fixture/reading-insights";
import {
  defineDaemon,
  defineInterface,
  defineRoute,
  protocol,
  UserPermissionLevelSchema,
  z,
} from "@rizom/brain/interfaces";

export default defineInterface({
  id: "reading-webhook",
  config: z.object({
    webhookToken: z.string().min(1),
    eventFeedUrl: z.url().default("http://127.0.0.1:4010/events"),
  }),

  routes: ({ config, jobs }) => [
    defineRoute({
      method: "GET",
      path: "/reading-digest/health",
      security: { kind: "public" },
      response: z.object({ status: z.literal("ok") }),
      handle: () => ({ status: "ok" }),
    }),
    defineRoute({
      method: "POST",
      path: "/hooks/reading-digest",
      security: protocol({
        authenticate({ request }) {
          const authorization = request.headers.get("authorization");
          const userId = request.headers.get("x-reading-user");
          if (authorization !== `Bearer ${config.webhookToken}` || !userId) {
            return null;
          }
          return { id: userId };
        },
      }),
      body: compileReadingDigest.input,
      response: z.object({
        jobId: z.string(),
        acceptedFor: z.string(),
        permission: UserPermissionLevelSchema,
        anchor: z.boolean(),
      }),
      async handle({ body, caller }) {
        const job = await jobs.enqueue(compileReadingDigest, body);
        return {
          jobId: job.id,
          acceptedFor: caller.actor.id,
          permission: caller.permission,
          anchor: caller.isAnchor,
        };
      },
    }),
  ],

  daemons: ({ config, jobs }) => [
    defineDaemon({
      id: "reading-event-feed",
      required: false,
      async run({ signal, health }) {
        const stream = new EventSource(config.eventFeedUrl);
        stream.addEventListener("open", () => health.ready());
        stream.addEventListener("message", (event) => {
          let payload: unknown;
          try {
            payload = JSON.parse(event.data);
          } catch {
            health.warning("Reading event feed sent invalid JSON");
            return;
          }
          const body = compileReadingDigest.input.safeParse(payload);
          if (!body.success) {
            health.warning("Reading event feed sent an invalid event");
            return;
          }
          jobs
            .enqueue(compileReadingDigest, body.data)
            .catch(() => health.warning("Reading event could not be enqueued"));
        });
        stream.addEventListener("error", () =>
          health.warning("Reading event feed is reconnecting"),
        );
        signal.addEventListener("abort", () => stream.close(), { once: true });

        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
      },
    }),
  ],
});
