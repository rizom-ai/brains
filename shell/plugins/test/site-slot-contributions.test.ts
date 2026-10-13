import { describe, expect, it } from "bun:test";
import { SdkError, SITE_BUILDER_CHANNELS } from "@brains/contracts";
import { caughtError } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import type {
  MessageBusSendRequest,
  MessageResponse,
} from "@brains/messaging-service";
import {
  defineServicePlugin,
  defineSubscription,
  instantiatePluginPackageDefinition,
} from "../src";
import { createPluginHarness } from "../src/test/harness";
import { createSiteContributions } from "../src/internal/site-contributions";

describe("host-issued layout slots", () => {
  it("detaches declarations, binds ownership and expires callbacks when the build returns or fails", async () => {
    const h = createPluginHarness();
    let renders = 0;
    const entry = {
      slotName: "footer-top",
      render: (): null => {
        renders++;
        return null;
      },
    };
    const entries = [entry];
    const definition = defineServicePlugin(
      { id: "provider", config: z.object({}) },
      { layoutSlots: () => entries },
    );
    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/slots", version: "1" },
    );
    if (!plugin) throw new Error("Missing provider");
    await h.installPlugin(plugin);
    const reader = createSiteContributions(
      h.getMockShell().getMessageBus(),
      "reader",
      new AbortController().signal,
    );
    let late: (() => unknown) | undefined;
    try {
      await reader.withSlots(new AbortController().signal, async (slots) => {
        expect(slots).toHaveLength(1);
        expect(slots[0]).toMatchObject({
          pluginId: "@fixture/slots:provider",
          priority: 50,
          slotName: "footer-top",
        });
        expect(Object.isFrozen(slots)).toBe(true);
        expect(Object.isFrozen(slots[0])).toBe(true);
        entry.render = (): null => {
          throw new Error("mutated declaration");
        };
        late = slots[0]?.render;
        expect(late?.()).toBeNull();
      });
      expect(renders).toBe(1);
      expect(() => late?.()).toThrow(SdkError);
      entry.render = (): null => null;
      expect(
        await reader
          .withSlots(new AbortController().signal, async (slots) => {
            late = slots[0]?.render;
            throw new Error("build failed");
          })
          .catch(caughtError),
      ).toMatchObject({ code: "handler_failed" });
      expect(() => late?.()).toThrow(SdkError);
      await reader.withSlots(new AbortController().signal, async (slots) => {
        late = slots[0]?.render;
        await plugin.shutdown?.();
        expect(() => late?.()).toThrow(SdkError);
      });
    } finally {
      await h.reset();
    }
  });

  it("rejects owner claims and never invokes their render callbacks", async () => {
    const h = createPluginHarness();
    let calls = 0;
    const forged = [
      {
        pluginId: "some-other-owner",
        slotName: "footer-top",
        render: (): null => {
          calls++;
          return null;
        },
      },
    ];
    const definition = defineServicePlugin(
      { id: "provider", config: z.object({}) },
      { layoutSlots: () => forged },
    );
    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/slots", version: "1" },
    );
    if (!plugin) throw new Error("Missing provider");
    try {
      await h.installPlugin(plugin);
      const reader = createSiteContributions(
        h.getMockShell().getMessageBus(),
        "reader",
        new AbortController().signal,
      );
      expect(
        await reader
          .withSlots(new AbortController().signal, async () => "never")
          .catch(caughtError),
      ).toMatchObject({ code: "invalid_response" });
      expect(calls).toBe(0);
    } finally {
      await h.reset();
    }
  });

  it("preserves declared failure codes and local causes without publishing diagnostic text", async () => {
    const h = createPluginHarness();
    const original = new SdkError("permission_denied", {
      message: "private diagnostic",
    });
    const definition = defineServicePlugin(
      { id: "provider", config: z.object({}) },
      {
        layoutSlots: () => {
          throw original;
        },
      },
    );
    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/slots", version: "1" },
    );
    if (!plugin) throw new Error("Missing provider");
    try {
      await h.installPlugin(plugin);
      const reader = createSiteContributions(
        h.getMockShell().getMessageBus(),
        "reader",
        new AbortController().signal,
      );
      const error = await reader
        .withSlots(new AbortController().signal, async () => "never")
        .catch(caughtError);
      expect(error).toMatchObject({
        code: "permission_denied",
        cause: { cause: { cause: original } },
      });
      expect(JSON.stringify(error)).not.toContain("private diagnostic");
    } finally {
      await h.reset();
    }
  });

  for (const [key, value] of [
    ["slotName", ""],
    ["priority", NaN],
    ["render", 42],
  ] as const) {
    it(`rejects malformed declaration ${key}`, async () => {
      const h = createPluginHarness();
      const entry = {
        slotName: "footer-top",
        priority: 50,
        render: (): null => null,
      };
      Reflect.set(entry, key, value);
      const definition = defineServicePlugin(
        { id: "provider", config: z.object({}) },
        { layoutSlots: () => [entry] },
      );
      const [plugin] = instantiatePluginPackageDefinition(
        definition,
        {},
        { name: "@fixture/slots", version: "1" },
      );
      if (!plugin) throw new Error("Missing provider");
      try {
        await h.installPlugin(plugin);
        const reader = createSiteContributions(
          h.getMockShell().getMessageBus(),
          "reader",
          new AbortController().signal,
        );
        expect(
          await reader
            .withSlots(new AbortController().signal, async () => "never")
            .catch(caughtError),
        ).toMatchObject({ code: "invalid_response" });
      } finally {
        await h.reset();
      }
    });
  }

  it("rejects raw function responses and a fabricated collection request", async () => {
    const h = createPluginHarness();
    const bus = h.getMockShell().getMessageBus();
    const definition = defineServicePlugin(
      { id: "provider", config: z.object({}) },
      { layoutSlots: () => [] },
    );
    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/slots", version: "1" },
    );
    if (!plugin) throw new Error("Missing provider");
    try {
      await h.installPlugin(plugin);
      expect(
        await bus.collect({
          type: SITE_BUILDER_CHANNELS.slots,
          payload: {},
          sender: "forged",
        }),
      ).toEqual([
        expect.objectContaining({ success: false, code: "permission_denied" }),
      ]);
      bus.subscribe(SITE_BUILDER_CHANNELS.slots, async () => ({
        success: true,
        data: [
          {
            pluginId: "forged",
            slotName: "footer-top",
            render: (): null => null,
          },
        ],
      }));
      const reader = createSiteContributions(
        bus,
        "reader",
        new AbortController().signal,
      );
      expect(
        await reader
          .withSlots(new AbortController().signal, async () => "never")
          .catch(caughtError),
      ).toMatchObject({ code: "invalid_response" });
    } finally {
      await h.reset();
    }
  });

  for (const owner of ["reader", "@fixture/forger:forger"]) {
    it(`refuses relaying an active collection from ${owner}`, async () => {
      const h = createPluginHarness();
      let calls = 0;
      const provider = defineServicePlugin(
        { id: "provider", config: z.object({}) },
        {
          layoutSlots: () => {
            calls++;
            return [{ slotName: "footer-top", render: (): null => null }];
          },
        },
      );
      const forger = defineServicePlugin(
        {
          id: "forger",
          config: z.object({}),
          setup: ({ messaging }) => ({ messaging }),
        },
        {
          subscriptions: ({ state }) => [
            defineSubscription({
              topic: SITE_BUILDER_CHANNELS.slots,
              payload: z.unknown(),
              response: z.unknown(),
              execution: "all-roles",
              handle: async ({ payload }) => {
                const answer = z
                  .object({
                    success: z.boolean(),
                    data: z.unknown().optional(),
                  })
                  .parse(
                    await state.messaging.request({
                      type: SITE_BUILDER_CHANNELS.slots,
                      payload,
                    }),
                  );
                if (!answer.success) throw new SdkError("permission_denied");
                return answer.data;
              },
            }),
          ],
        },
      );
      try {
        for (const [definition, name] of [
          [provider, "provider"],
          [forger, "forger"],
        ] as const) {
          const [plugin] = instantiatePluginPackageDefinition(
            definition,
            {},
            { name: `@fixture/${name}`, version: "1" },
          );
          if (!plugin) throw new Error("Missing provider");
          await h.installPlugin(plugin);
        }
        const reader = createSiteContributions(
          h.getMockShell().getMessageBus(),
          owner,
          new AbortController().signal,
        );
        let builds = 0;
        expect(
          await reader
            .withSlots(new AbortController().signal, async () => {
              builds++;
            })
            .catch(caughtError),
        ).toMatchObject({ code: "permission_denied" });
        expect(calls).toBe(1);
        expect(builds).toBe(0);
      } finally {
        await h.reset();
      }
    });
  }

  it("refuses replay of an issued response in a later collection", async () => {
    const h = createPluginHarness();
    const bus = h.getMockShell().getMessageBus();
    let credential: unknown;
    const definition = defineServicePlugin(
      { id: "provider", config: z.object({}) },
      { layoutSlots: () => [] },
    );
    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/slots", version: "1" },
    );
    if (!plugin) throw new Error("Missing provider");
    try {
      await h.installPlugin(plugin);
      const reader = createSiteContributions(
        {
          collect: async <T, R>(
            request: MessageBusSendRequest<T>,
          ): Promise<MessageResponse<R>[]> => {
            const answers = await bus.collect<T, R>(request);
            const first = answers[0];
            if (first && "data" in first) credential = first.data;
            return answers;
          },
        },
        "reader",
        new AbortController().signal,
      );
      await reader.withSlots(new AbortController().signal, async (slots) => {
        expect(slots).toEqual([]);
      });
      const replay = credential;
      expect(replay).toBeDefined();
      bus.subscribe(SITE_BUILDER_CHANNELS.slots, async () => ({
        success: true,
        data: replay,
      }));
      expect(
        await reader
          .withSlots(new AbortController().signal, async () => "never")
          .catch(caughtError),
      ).toMatchObject({ code: "invalid_response" });
    } finally {
      await h.reset();
    }
  });

  it("refuses cancelled admission/results and retained callbacks during a build", async () => {
    const h = createPluginHarness();
    let collections = 0;
    let cancelCollection = (): void => {};
    const definition = defineServicePlugin(
      { id: "provider", config: z.object({}) },
      {
        layoutSlots: () => {
          collections++;
          cancelCollection();
          return [{ slotName: "footer-top", render: (): null => null }];
        },
      },
    );
    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/slots", version: "1" },
    );
    if (!plugin) throw new Error("Missing provider");
    try {
      await h.installPlugin(plugin);
      const reader = createSiteContributions(
        h.getMockShell().getMessageBus(),
        "reader",
        new AbortController().signal,
      );
      expect(
        await reader
          .withSlots(AbortSignal.abort(), async () => "never")
          .catch(caughtError),
      ).toMatchObject({ code: "cancelled" });
      expect(collections).toBe(0);
      const abort = new AbortController();
      expect(
        await reader
          .withSlots(abort.signal, async (slots) => {
            abort.abort();
            expect(() => slots[0]?.render()).toThrow(SdkError);
            return "refused result";
          })
          .catch(caughtError),
      ).toMatchObject({ code: "cancelled" });
      expect(collections).toBe(1);
      const during = new AbortController();
      cancelCollection = (): void => {
        during.abort();
      };
      let builds = 0;
      expect(
        await reader
          .withSlots(during.signal, async () => {
            builds++;
          })
          .catch(caughtError),
      ).toMatchObject({ code: "cancelled" });
      expect(collections).toBe(2);
      expect(builds).toBe(0);
    } finally {
      await h.reset();
    }
  });
});
