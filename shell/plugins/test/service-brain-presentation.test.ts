import { afterEach, describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  defineServicePlugin,
  defineSubscription,
  defineTool,
  instantiatePluginPackageDefinition,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

/**
 * A service that publishes the brain to a network describes the brain: who
 * it is, whose it is, what kind of profile it represents, what it offers, and
 * whether it has a web channel. Those reads the runtime already answers.
 * Announcements from a service go to everyone listening, not to the first
 * subscriber that answers. Named consumer: @brains/atproto, which publishes
 * the brain card and announces what it discovers.
 */
describe("service brain presentation and announcements", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("service-presentation-test"),
  });

  afterEach(async () => {
    await harness.reset();
  });

  it("hands setup the brain's identity, profile kind, skills, HTTP serving intent and site URL", async () => {
    let described: Record<string, unknown> | undefined;
    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin({
        id: "card",
        config: z.object({}),
        setup: ({ identity, profileKinds, publicSkills, http, siteUrl }) => {
          described = {
            character: identity.get().name,
            profile: identity.getProfile().name,
            appInfo: identity.getAppInfo(),
            kind: (): unknown => profileKinds.getResolved(),
            skills: publicSkills.list(),
            hasHttpHost: (): boolean => http.isConfigured(),
            siteUrl,
          };
          return {};
        },
      }),
      {},
      { name: "@fixture/card", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");

    await harness.installPlugin(plugin);

    if (!described) throw new Error("setup did not run");
    expect(typeof described["character"]).toBe("string");
    expect(typeof described["profile"]).toBe("string");
    expect(await described["appInfo"]).toMatchObject({
      model: expect.any(String),
    });
    expect(await described["skills"]).toEqual([]);
    const hasHttpHost = described["hasHttpHost"];
    if (typeof hasHttpHost !== "function")
      throw new Error("HTTP reader not captured");
    expect(hasHttpHost()).toBe(false);
    harness.getMockShell().isHttpHostConfigured = (): boolean => true;
    expect(hasHttpHost()).toBe(true);
    harness.getMockShell().getProfileKindRegistry().finalize();
    const kind = described["kind"];
    if (typeof kind !== "function") throw new Error("kind not captured");
    expect(kind()).toBeDefined();
  });

  it("announces to every subscriber from ready, a subscription and a tool", async () => {
    const heard: string[] = [];
    for (const listener of ["first", "second"]) {
      harness.subscribe("card:announced", async (message) => {
        heard.push(`${listener}:${String(message.payload)}`);
        return { success: true };
      });
    }
    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin(
        {
          id: "card",
          config: z.object({}),
        },
        {
          ready: async ({ messaging }) => {
            await messaging.publish({
              topic: "card:announced",
              data: { from: "ready" },
            });
          },
          subscriptions: () => [
            defineSubscription({
              topic: "card:trigger",
              payload: z.object({}),
              handle: async ({ messaging }) => {
                await messaging.publish({
                  topic: "card:announced",
                  data: { from: "subscription" },
                });
                return {};
              },
            }),
          ],
          tools: () => [
            defineTool({
              name: "announce",
              description: "Announce.",
              input: z.object({}),
              output: z.object({}),
              execute: async ({ messaging }) => {
                await messaging.publish({
                  topic: "card:announced",
                  data: { from: "tool" },
                });
                return {};
              },
            }),
          ],
        },
      ),
      {},
      { name: "@fixture/card", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");
    await harness.installPlugin(plugin);

    if (!plugin.ready) throw new Error("no ready hook");
    await plugin.ready();
    await harness.sendMessage("card:trigger", {});
    await harness.executeTool("card_announce", {});

    const sources = heard.map((entry) => entry.split(":")[0]);
    expect(sources.filter((s) => s === "first")).toHaveLength(3);
    expect(sources.filter((s) => s === "second")).toHaveLength(3);
  });
});
