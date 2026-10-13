import { describe, expect, it } from "bun:test";
import { SITE_BUILDER_CHANNELS } from "@brains/contracts";
import { caughtError } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  defineServicePlugin,
  defineSubscription,
  instantiatePluginPackageDefinition,
} from "../src";
import { createPluginHarness } from "../src/test/harness";
import { createSiteContributions } from "../src/internal/site-contributions";

describe("installed site contributions", () => {
  it("has a fixed topic and installed sender, frozen detached results, and closes on shutdown", async () => {
    const h = createPluginHarness();
    let read: (
      signal?: AbortSignal,
    ) => Promise<readonly string[]> = async () => {
      throw new Error("Not installed");
    };
    const sources: string[] = [];
    const declarations = [
      defineServicePlugin({
        id: "reader",
        config: z.object({}),
        setup: (context) => {
          expect(Object.keys(context.siteContributions)).toEqual([
            "withSlots",
            "headScripts",
          ]);
          expect(Object.isFrozen(context.siteContributions)).toBe(true);
          read = context.siteContributions.headScripts;
          return {};
        },
      }),
      defineServicePlugin(
        { id: "provider", config: z.object({}) },
        {
          subscriptions: () => [
            defineSubscription({
              topic: SITE_BUILDER_CHANNELS.headScripts,
              payload: z.object({}),
              response: z.string(),
              execution: "all-roles",
              handle: ({ source }) => {
                sources.push(source);
                return "<script>fixture</script>";
              },
            }),
          ],
        },
      ),
    ];
    try {
      for (const definition of declarations) {
        const [plugin] = instantiatePluginPackageDefinition(
          definition,
          {},
          { name: "@fixture/site", version: "1" },
        );
        if (!plugin) throw new Error("Missing plugin");
        const register = plugin.register.bind(plugin);
        plugin.register = (shell, options): ReturnType<typeof register> =>
          register(shell, { ...options, executionOnly: true });
        await h.installPlugin(plugin);
      }
      const first = await read();
      expect(first).toEqual(["<script>fixture</script>"]);
      expect(Object.isFrozen(first)).toBe(true);
      expect(Reflect.set(first, 0, "changed")).toBe(false);
      expect(await read()).not.toBe(first);
      expect(sources).toEqual(["@fixture/site:reader", "@fixture/site:reader"]);
      const bus = h.getMockShell().getMessageBus();
      await h.reset();
      expect(
        await createSiteContributions(
          bus,
          "fresh-reader",
          new AbortController().signal,
        ).headScripts(),
      ).toEqual([]);
      expect(await read().catch(caughtError)).toMatchObject({
        code: "cancelled",
      });
    } finally {
      await h.reset();
    }
  });

  for (const response of [
    { success: true, data: { script: 42 } },
    { success: false, error: "private detail", code: "permission_denied" },
  ] as const) {
    it(`rejects ${response.success ? "malformed" : "failed"} responses with a public code`, async () => {
      const h = createPluginHarness();
      const bus = h.getMockShell().getMessageBus();
      bus.subscribe(SITE_BUILDER_CHANNELS.headScripts, async () => response);
      try {
        const reader = createSiteContributions(
          bus,
          "installed",
          new AbortController().signal,
        );
        const failure = caughtError(
          await reader.headScripts().catch(caughtError),
        );
        expect(failure).toMatchObject({
          code: response.success ? "invalid_response" : "permission_denied",
        });
        expect(failure.message).not.toContain("private detail");
        expect(failure.cause).toMatchObject({ cause: response });
      } finally {
        await h.reset();
      }
    });
  }

  it("refuses aborted calls and drains admitted callbacks before refusing their result", async () => {
    const h = createPluginHarness();
    const bus = h.getMockShell().getMessageBus();
    const lifetime = new AbortController();
    const call = new AbortController();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let calls = 0;
    bus.subscribe(SITE_BUILDER_CHANNELS.headScripts, async () => {
      calls++;
      entered.resolve();
      await release.promise;
      return { success: true, data: "late" };
    });
    try {
      const reader = createSiteContributions(bus, "installed", lifetime.signal);
      expect(
        await reader.headScripts(AbortSignal.abort()).catch(caughtError),
      ).toMatchObject({ code: "cancelled" });
      expect(calls).toBe(0);
      const pending = reader.headScripts(call.signal).catch(caughtError);
      await entered.promise;
      call.abort();
      release.resolve();
      expect(await pending).toMatchObject({ code: "cancelled" });
      expect(calls).toBe(1);
      lifetime.abort();
      expect(await reader.headScripts().catch(caughtError)).toMatchObject({
        code: "cancelled",
      });
      expect(calls).toBe(1);
    } finally {
      release.resolve();
      await h.reset();
    }
  });
});
