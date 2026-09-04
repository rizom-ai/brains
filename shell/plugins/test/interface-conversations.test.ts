import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineMessageInterface,
  defineRoute,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * What an interface hosting a conversation over HTTP needs to answer with.
 *
 * `@brains/web-chat` serves a session list, a message history, a rename and a
 * delete — the conversation surface, over HTTP, on behalf of whoever is signed
 * in. It reached that surface by indexing the runtime context type
 * (`InterfacePluginContext["conversations"]`), which is what having no name
 * for it looks like.
 *
 * The narrow read comes with it: a page rendering an attachment fetches the
 * entity the conversation named. One method, not the entity service — an
 * interface owns no types, so every write is a trespass by construction.
 */

function instantiate(
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
  config: unknown,
): NonNullable<ReturnType<typeof instantiatePluginPackageDefinition>[number]> {
  const [plugin] = instantiatePluginPackageDefinition(definition, config, {
    name: "@fixture/conversation-console",
    version: "0.1.0",
  });
  if (!plugin) throw new Error("Message interface plugin was not created");
  return plugin;
}

const conversationConsole = defineMessageInterface({
  id: "conversation-console",
  config: z.object({}),
  channel: {
    type: "conversation-console",
    displayName: "Console",
    subjectLabel: "Browser session",
    recipient: z.string().min(1),
  },
  setup: ({ conversations, entities }) => ({ conversations, entities }),
  routes: ({ state }) => [
    defineRoute({
      method: "POST",
      path: "/console/sessions",
      security: { kind: "public" },
      body: z.object({ id: z.string() }),
      response: z.object({ conversationId: z.string() }),
      handle: async ({ body }) => ({
        conversationId: await state.conversations.start({
          sessionId: body.id,
          interfaceType: "conversation-console",
          channelId: body.id,
          metadata: {
            channelName: "Console",
            interfaceType: "conversation-console",
            channelId: body.id,
          },
        }),
      }),
    }),
    defineRoute({
      method: "GET",
      path: "/console/attachment",
      security: { kind: "public" },
      response: z.object({ found: z.boolean() }),
      handle: async () => ({
        found:
          (await state.entities.getEntity({
            entityType: "note",
            id: "missing",
          })) !== null,
      }),
    }),
  ],
  send: () => undefined,
});

describe("an interface that hosts a conversation", () => {
  it("reaches the conversation surface and a read of its own", async () => {
    const harness = createPluginHarness();
    const plugin = instantiate(conversationConsole, {});
    await harness.installPlugin(plugin);

    const routes = plugin.getWebRoutes?.() ?? [];
    const routeAt = (method: string, path: string): (typeof routes)[number] => {
      const route = routes.find(
        (candidate) => candidate.path === path && candidate.method === method,
      );
      if (!route) throw new Error(`route ${method} ${path} was not registered`);
      return route;
    };

    const started = await routeAt("POST", "/console/sessions").handler(
      new Request("http://brain/console/sessions", {
        method: "POST",
        body: JSON.stringify({ id: "thread-1" }),
      }),
    );
    // The runtime issues the id, not the caller: a session name is the
    // client's word for a thread, and the brain files it under its own.
    const { conversationId } = (await started.json()) as {
      conversationId: string;
    };
    expect(conversationId).toMatch(/^conv-/u);

    // The read is wired and answers honestly about something absent, rather
    // than throwing because no entity access reached the declaration.
    const attachment = await routeAt("GET", "/console/attachment").handler(
      new Request("http://brain/console/attachment"),
    );
    expect(await attachment.json()).toEqual({ found: false });
  });
});
