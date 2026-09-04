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
 * What a console knows about the rest of the brain.
 *
 * `@brains/web-chat` renders a strip of links to the other consoles, and
 * redirects to its own workspace inside Studio when Studio is mounted. It did
 * both by reading `webRoutes.getRoutes()` — the whole mounted route table —
 * and then guessing: finding Studio's `/api/types` route, slicing that suffix
 * off to recover a base path, and building a workspace URL by hand.
 *
 * That is the shape this plan exists to remove. The strip half is answerable
 * without the route table: the runtime knows which surfaces are mounted and
 * what each requires, so a console only has to say who is asking.
 *
 * The Studio redirect is a different question and is left open deliberately —
 * see the plan. `web-chat:chat` reads like web-chat's workspace but is
 * Studio's own, declared `pluginId: "studio"` and host-owned, so
 * `workspaceUrl(id)` is the wrong answer to reach for.
 */

function instantiate(
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
  config: unknown,
): NonNullable<ReturnType<typeof instantiatePluginPackageDefinition>[number]> {
  const [plugin] = instantiatePluginPackageDefinition(definition, config, {
    name: "@fixture/console",
    version: "0.1.0",
  });
  if (!plugin) throw new Error("Message interface plugin was not created");
  return plugin;
}

const console = defineMessageInterface({
  id: "web-chat",
  config: z.object({}),
  channel: {
    type: "web-chat",
    displayName: "Chat",
    subjectLabel: "Browser session",
    recipient: z.string().min(1),
  },
  setup: ({ surfaces, inboxFollowUps }) => {
    // A console offers a way to continue an inbox item as a conversation.
    inboxFollowUps.registerKind({
      kind: "discuss-in-chat",
      label: "Discuss in chat",
      priority: 10,
      mode: "universal",
      permissionLevel: "trusted",
      applies: () => true,
      resolve: () => ({ href: "/chat" }),
    });
    return { surfaces };
  },
  routes: ({ state }) => [
    defineRoute({
      method: "GET",
      path: "/chat",
      security: { kind: "public" },
      response: verbatim,
      handle: () =>
        Response.json({
          doors: state
            .surfaces({
              permissionLevel: "admin",
              hasActiveSession: true,
              selfHref: "/chat",
            })
            .map((surface) => surface.id),
        }),
    }),
  ],
  send: () => undefined,
});

describe("a console asking about the rest of the brain", () => {
  it("answers with its own workspace and the doors a caller may see", async () => {
    const harness = createPluginHarness();
    const plugin = instantiate(console, {});
    await harness.installPlugin(plugin);

    const [route] = plugin.getWebRoutes?.() ?? [];
    if (!route) throw new Error("console route was not registered");
    const answer = (await (
      await route.handler(new Request("http://brain/chat"))
    ).json()) as { doors: string[] };

    // A console always shows itself, even when nothing else is mounted — the
    // caller reached it through its own gate.
    expect(answer.doors).toContain("web-chat");
  });
});
