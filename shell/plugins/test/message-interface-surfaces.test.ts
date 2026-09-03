import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineMessageInterface,
  defineRoute,
  instantiatePluginPackageDefinition,
  verbatim,
} from "../src";

/**
 * What `@brains/web-chat` needs that the message-interface surface could not
 * say.
 *
 * A message interface is an interface. web-chat is a chat channel *and* a
 * console: it serves a page, uploads and a session list over HTTP, resolves
 * the browser session behind each request, and advertises where it can be
 * reached. The declared contracts had drifted apart — the generic family
 * could answer HTTP and knew about auth, endpoints and the agent; the message
 * family could keep runtime state and publish on the bus, and neither had the
 * other's half. Nothing designed that split.
 *
 * The runtime contexts never diverged: `MessageInterfacePluginContext` has
 * extended `InterfacePluginContext` all along. Only what a declaration was
 * allowed to ask for was narrower.
 */

function instantiate(
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
  config: unknown,
): NonNullable<ReturnType<typeof instantiatePluginPackageDefinition>[number]> {
  const [plugin] = instantiatePluginPackageDefinition(definition, config, {
    name: "@fixture/console-channel",
    version: "0.1.0",
  });
  if (!plugin) throw new Error("Message interface plugin was not created");
  return plugin;
}

const consoleChannel = defineMessageInterface({
  id: "console-channel",
  config: z.object({}),
  channel: {
    type: "console-channel",
    displayName: "Console",
    subjectLabel: "Browser session",
    recipient: z.string().min(1),
  },
  setup: ({ endpoints, interactions, runtimeState, uploads, logger }) => {
    // A console is a way in, and says so.
    endpoints.register({
      label: "Console",
      url: "/console",
      priority: 10,
      visibility: "trusted",
    });
    interactions.register({
      id: "console-channel",
      label: "Console",
      href: "/console",
      kind: "human",
      priority: 10,
      visibility: "trusted",
    });
    return {
      // Both halves at once: bookkeeping that survives a restart, and
      // somewhere to put the files people attach.
      seen: runtimeState({
        namespace: "seen",
        schema: z.object({ count: z.number() }),
      }),
      files: uploads({
        namespace: "upload",
        refKind: "upload",
        routePath: "/console/uploads",
      }),
      logger,
    };
  },
  routes: ({ state }) => [
    defineRoute({
      method: "GET",
      path: "/console",
      security: { kind: "public" },
      // A console serves a page, not an envelope.
      response: verbatim,
      handle: () =>
        new Response("<!doctype html><title>Console</title>", {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    }),
    defineRoute({
      method: "POST",
      path: "/console/uploads",
      security: { kind: "public" },
      body: z.object({ filename: z.string(), text: z.string() }),
      response: z.object({ id: z.string(), count: z.number() }),
      handle: async ({ body }) => {
        const record = await state.files.save({
          filename: body.filename,
          mediaType: "text/plain",
          content: Buffer.from(body.text, "utf8"),
        });
        const previous = (await state.seen.get("total"))?.count ?? 0;
        await state.seen.set("total", { count: previous + 1 });
        return { id: record.ref.id, count: previous + 1 };
      },
    }),
  ],
  send: () => undefined,
});

describe("a message interface that is also a console", () => {
  it("serves its own routes, keeps state, and advertises where it is", async () => {
    const harness = createPluginHarness();
    const plugin = instantiate(consoleChannel, {});
    await harness.installPlugin(plugin);

    const routes = plugin.getWebRoutes?.() ?? [];
    expect(routes.map(({ path }) => path).sort()).toEqual([
      "/console",
      "/console/uploads",
    ]);

    const routeAt = (path: string): (typeof routes)[number] => {
      const route = routes.find((candidate) => candidate.path === path);
      if (!route) throw new Error(`route ${path} was not registered`);
      return route;
    };

    const page = await routeAt("/console").handler(
      new Request("http://brain/console"),
    );
    expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await page.text()).toContain("<title>Console</title>");

    const uploads = routeAt("/console/uploads");
    const first = await uploads.handler(
      new Request("http://brain/console/uploads", {
        method: "POST",
        body: JSON.stringify({ filename: "note.txt", text: "hello" }),
      }),
    );
    expect(await first.json()).toMatchObject({ count: 1 });

    const second = await uploads.handler(
      new Request("http://brain/console/uploads", {
        method: "POST",
        body: JSON.stringify({ filename: "again.txt", text: "hello" }),
      }),
    );
    // The count survived because the state is the runtime's, not the request's.
    expect(await second.json()).toMatchObject({ count: 2 });

    expect(
      harness
        .getMockShell()
        .listInteractions()
        .map(({ id }) => id),
    ).toEqual(["console-channel"]);
  });
});
