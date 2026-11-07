import { describe, expect, it, spyOn } from "bun:test";
import {
  SdkError,
  createExternalActorId,
  type ActorRef,
} from "@brains/contracts";
import { PermissionService } from "@brains/templates";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  defineEntity,
  defineJob,
  defineRoute,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  protocol,
  type Plugin,
  type WebRouteDefinition,
} from "../src";

const reminder = defineEntity({
  type: "reminder",
  purpose: "A task to remember",
  metadata: z.object({ status: z.enum(["open", "done"]) }),
});

const remind = defineJob({
  name: "remind",
  input: z.object({ id: z.string() }),
  output: z.object({ id: z.string() }),
});

const reminderInput = z.object({ id: z.string(), title: z.string() });

/** A webhook signs its calls with a bearer token naming the caller. */
const bearer = protocol({
  authenticate({ request }) {
    const token = request.headers.get("authorization");
    return token?.startsWith("Bearer ") ? { id: token.slice(7) } : null;
  },
});

async function install(
  shell: MockShell,
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
): Promise<WebRouteDefinition[]> {
  const plugins = instantiatePluginPackageDefinition(
    definition,
    {},
    { name: "@fixture/reminders", version: "0.1.0" },
  );
  const registered = await plugins.reduce<Promise<Plugin[]>>(
    async (done, plugin) => {
      await plugin.register(shell);
      return [...(await done), plugin];
    },
    Promise.resolve([]),
  );
  const service = registered.find((plugin) => plugin.type === "service");
  return service?.getWebRoutes?.() ?? [];
}

function routeAt(
  routes: WebRouteDefinition[],
  method: string,
  path: string,
): WebRouteDefinition {
  const route = routes.find(
    (candidate) => candidate.method === method && candidate.path === path,
  );
  if (!route) throw new Error(`No route ${method} ${path}`);
  return route;
}

function post(path: string, body: string, token?: string): Request {
  return new Request(`http://brain${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body,
  });
}

function remindersShell(): MockShell {
  const shell = createMockShell();
  shell.getPermissionService = (): PermissionService =>
    new PermissionService({
      trusted: ["reminders:alex"],
      entityActions: { reminder: { create: "trusted" } },
    });
  return shell;
}

const reminders = defineServicePlugin(
  {
    id: "reminders",
    config: z.object({ greeting: z.string().default("Hello") }),
    entities: [reminder],
    setup: () => ({ startedAt: "now" }),
  },
  {
    jobs: () => [remind.handle(async ({ input }) => ({ id: input.id }))],
    routes: ({ config, state, entities, jobs }) => [
      defineRoute({
        method: "GET",
        path: "/reminders/health",
        security: { kind: "public" },
        response: z.object({ greeting: z.string(), since: z.string() }),
        handle: (context) => {
          // Capabilities are the slot's; the handler is given the call's data.
          expect(Object.keys(context).sort()).toEqual([
            "body",
            "caller",
            "request",
          ]);
          return { greeting: config.greeting, since: state.startedAt };
        },
      }),
      defineRoute({
        method: "POST",
        path: "/reminders",
        security: bearer,
        body: reminderInput,
        response: z.object({ id: z.string(), jobId: z.string() }),
        async handle({ body, caller }) {
          // The route's caller writes, and starts the job.
          const created = await entities.create(reminder, {
            id: body.id,
            content: body.title,
            metadata: { status: "open" },
          });
          const job = await jobs.enqueue(remind, { id: created.id });
          return { id: `${created.id}:${caller.permission}`, jobId: job.id };
        },
      }),
      defineRoute({
        method: "POST",
        path: "/reminders/public",
        security: { kind: "public" },
        body: reminderInput,
        response: z.object({ id: z.string() }),
        // Outside a signed call, the route acts for nobody in particular.
        handle: ({ body }) =>
          entities.create(reminder, {
            id: body.id,
            content: body.title,
            metadata: { status: "open" },
          }),
      }),
      defineRoute({
        method: "GET",
        path: "/reminders/missing",
        security: { kind: "public" },
        response: z.object({}),
        handle: () => {
          throw new SdkError("not_found", {
            message: "no reminder row 42",
            publicMessage: "No such reminder",
          });
        },
      }),
      defineRoute({
        method: "GET",
        path: "/reminders/broken",
        security: { kind: "public" },
        response: z.object({}),
        handle: () => {
          throw new Error("database at /var/brain is locked");
        },
      }),
      defineRoute({
        method: "GET",
        path: "/reminders/stray",
        security: { kind: "public" },
        response: z.object({ count: z.number() }),
        handle: () => ({ count: "many" }),
      }),
    ],
  },
);

describe("a service's declared routes", () => {
  it("answer with the slot's capabilities and the response schema", async () => {
    const routes = await install(remindersShell(), reminders);

    const health = await routeAt(routes, "GET", "/reminders/health").handler(
      new Request("http://brain/reminders/health"),
    );
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ greeting: "Hello", since: "now" });
  });

  it("write and start jobs as the signed caller", async () => {
    const shell = remindersShell();
    const created = spyOn(shell.getEntityService(), "createEntity");
    const enqueued = spyOn(shell.getJobQueueService(), "enqueue");
    const routes = await install(shell, reminders);
    const route = routeAt(routes, "POST", "/reminders");

    const unsigned = await route.handler(
      post("/reminders", JSON.stringify({ id: "call", title: "Call Sam" })),
    );
    expect(unsigned.status).toBe(401);
    expect(await unsigned.json()).toEqual({
      error: "Authentication required",
      code: "unauthenticated",
    });

    const signed = await route.handler(
      post(
        "/reminders",
        JSON.stringify({ id: "call", title: "Call Sam" }),
        "alex",
      ),
    );
    expect(signed.status).toBe(200);
    expect(await signed.json()).toMatchObject({ id: "call:trusted" });
    // The signed actor, qualified by the declaration that admitted it.
    const actor: ActorRef = {
      kind: "external",
      externalActorId: createExternalActorId("reminders", "alex"),
    };
    const written = created.mock.calls.find(
      ([request]) => request.entity.id === "call",
    );
    expect(written?.[0].options?.eventContext).toEqual({ actor });
    const job = enqueued.mock.calls.find(([request]) =>
      String(request.type).endsWith("remind"),
    );
    expect(job?.[0].data).toMatchObject({
      authority: { actor, permissionCeiling: "trusted" },
    });
  });

  it("act for nobody in particular on a public route", async () => {
    const routes = await install(remindersShell(), reminders);

    const refused = await routeAt(routes, "POST", "/reminders/public").handler(
      post(
        "/reminders/public",
        JSON.stringify({ id: "spam", title: "Buy now" }),
      ),
    );
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "permission_denied" });
  });

  it("answer a failure in its public form, with the status its code names", async () => {
    const routes = await install(remindersShell(), reminders);
    const answer = async (
      route: WebRouteDefinition,
      request: Request,
    ): Promise<{ status: number; body: unknown }> => {
      const response = await route.handler(request);
      return { status: response.status, body: await response.json() };
    };

    expect(
      await answer(
        routeAt(routes, "GET", "/reminders/missing"),
        new Request("http://brain/reminders/missing"),
      ),
    ).toEqual({
      status: 404,
      body: { error: "No such reminder", code: "not_found" },
    });
    const broken = await answer(
      routeAt(routes, "GET", "/reminders/broken"),
      new Request("http://brain/reminders/broken"),
    );
    expect(broken).toEqual({
      status: 500,
      body: { error: "The operation failed", code: "handler_failed" },
    });
    expect(
      await answer(
        routeAt(routes, "GET", "/reminders/stray"),
        new Request("http://brain/reminders/stray"),
      ),
    ).toEqual({
      status: 500,
      body: { error: "Invalid response", code: "invalid_response" },
    });

    const create = routeAt(routes, "POST", "/reminders");
    expect(
      await answer(create, post("/reminders", "not json", "alex")),
    ).toEqual({
      status: 400,
      body: { error: "Request body must be valid JSON", code: "invalid_input" },
    });
    expect(
      await answer(create, post("/reminders", JSON.stringify({}), "alex")),
    ).toEqual({
      status: 400,
      body: {
        error: expect.stringContaining("id:"),
        code: "invalid_input",
      },
    });
  });

  it("are refused in the header, where no behavior goes", () => {
    expect(() =>
      defineServicePlugin({
        id: "reminders",
        config: z.object({}),
        // @ts-expect-error -- behavior goes in the second argument
        routes: () => [],
      }),
    ).toThrow();
  });
});
