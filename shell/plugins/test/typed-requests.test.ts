import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineServicePlugin,
  defineSubscription,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * Asking a question whose answer has a shape.
 *
 * A request came back as `unknown`, so the asking package parsed twice: once
 * for the bus envelope, once for the answer inside it, and mapped every
 * failure to the same shrug. Both packages already share the schemas — one
 * declares the topic and what goes each way, and the answerer and the asker
 * name that one declaration.
 */
const readCount = {
  topic: "counter:count",
  payload: z.object({ of: z.string() }),
  response: z.object({ count: z.number() }),
};

describe("a request whose answer is declared", () => {
  const harness = createPluginHarness();

  const answerer = (
    handle: (input: { of: string }) => { count: number },
  ): ReturnType<typeof defineServicePlugin> =>
    defineServicePlugin(
      { id: "counter", config: z.object({}) },
      {
        subscriptions: () => [
          defineSubscription({
            ...readCount,
            handle: ({ payload }) => handle(payload),
          }),
        ],
      },
    );

  it("hands the asker the parsed answer", async () => {
    let answer: { ok: boolean; data?: { count: number } } | undefined;

    const [counter] = instantiatePluginPackageDefinition(
      answerer(({ of }) => ({ count: of.length })),
      {},
      { name: "@fixture/counter", version: "0.1.0" },
    );
    const [asker] = instantiatePluginPackageDefinition(
      defineServicePlugin(
        { id: "asker", config: z.object({}) },
        {
          subscriptions: () => [
            defineSubscription({
              topic: "asker:go",
              payload: z.object({}),
              handle: async ({ messaging }) => {
                answer = await messaging.request(readCount, { of: "seven!!" });
                return {};
              },
            }),
          ],
        },
      ),
      {},
      { name: "@fixture/asker", version: "0.1.0" },
    );
    if (!counter || !asker) throw new Error("Plugins were not created");
    await harness.installPlugin(counter);
    await harness.installPlugin(asker);

    await harness.sendMessage("asker:go", {});

    expect(answer).toEqual({ ok: true, data: { count: 7 } });

    await harness.reset();
  });

  it("says why when nobody is listening", async () => {
    let answer: { ok: boolean; code?: string } | undefined;

    const [asker] = instantiatePluginPackageDefinition(
      defineServicePlugin(
        { id: "lonely", config: z.object({}) },
        {
          subscriptions: () => [
            defineSubscription({
              topic: "lonely:go",
              payload: z.object({}),
              handle: async ({ messaging }) => {
                answer = await messaging.request(readCount, { of: "x" });
                return {};
              },
            }),
          ],
        },
      ),
      {},
      { name: "@fixture/lonely", version: "0.1.0" },
    );
    if (!asker) throw new Error("Plugin was not created");
    await harness.installPlugin(asker);

    await harness.sendMessage("lonely:go", {});

    expect(answer).toEqual({ ok: false, code: "no_handler" });

    await harness.reset();
  });

  it("refuses an answer that does not match what was declared", async () => {
    let answer: { ok: boolean; code?: string } | undefined;

    const [counter] = instantiatePluginPackageDefinition(
      defineServicePlugin(
        { id: "liar", config: z.object({}) },
        {
          subscriptions: () => [
            defineSubscription({
              topic: readCount.topic,
              payload: readCount.payload,
              // Declares nothing, and answers with the wrong shape.
              handle: () => ({ count: "lots" }),
            }),
          ],
        },
      ),
      {},
      { name: "@fixture/liar", version: "0.1.0" },
    );
    const [asker] = instantiatePluginPackageDefinition(
      defineServicePlugin(
        { id: "trusting", config: z.object({}) },
        {
          subscriptions: () => [
            defineSubscription({
              topic: "trusting:go",
              payload: z.object({}),
              handle: async ({ messaging }) => {
                answer = await messaging.request(readCount, { of: "x" });
                return {};
              },
            }),
          ],
        },
      ),
      {},
      { name: "@fixture/trusting", version: "0.1.0" },
    );
    if (!counter || !asker) throw new Error("Plugins were not created");
    await harness.installPlugin(counter);
    await harness.installPlugin(asker);

    await harness.sendMessage("trusting:go", {});

    expect(answer).toEqual({ ok: false, code: "invalid_response" });

    await harness.reset();
  });
});
