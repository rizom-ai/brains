import { expect, it } from "bun:test";
import { caughtError } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  defineEntity,
  defineInterface,
  defineServicePlugin,
  defineSubscription,
  instantiatePluginPackageDefinition,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

async function refused(work: () => Promise<unknown>): Promise<Error> {
  try {
    await work();
  } catch (error) {
    return caughtError(error);
  }
  throw new Error("Expected capability refusal");
}

it("binds delivery identity, owned receipts and confirmation lifetime to an installed service, never payload claims", async () => {
  const faq = defineEntity({
    type: "faq",
    purpose: "Delivery fixture",
    metadata: z.object({}),
  });
  const foreign = defineEntity({
    type: "foreign",
    purpose: "Not owned",
    metadata: z.object({}),
  });
  const late: Array<() => Promise<unknown>> = [];
  const signals: Array<AbortSignal | undefined> = [];
  const harness = createPluginHarness();
  harness.getMockShell().generateObject = async <T>(
    _prompt: string,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<{ object: T }> => {
    signals.push(signal);
    return { object: schema.parse({ same: true }) };
  };
  const definition = defineServicePlugin(
    { id: "capture", config: z.object({}), entities: [faq] },
    {
      subscriptions: () => [
        defineSubscription({
          topic: "fixture:delivery",
          payload: z.object({ messageId: z.string() }),
          handle: async ({ messageId, entities, ai }) => {
            const operation = entities.mutations.once(
              faq,
              "source-review",
              messageId,
            );
            await operation.complete({ operation: "none" });
            expect(
              await refused(() => entities.mutations.read(foreign, "one")),
            ).toMatchObject({ code: "permission_denied" });
            expect(
              await ai.generateObject(
                "confirm",
                z.object({ same: z.boolean() }),
              ),
            ).toEqual({ object: { same: true } });
            late.push(
              () => operation.get(),
              () => entities.mutations.read(faq, "one"),
              () => ai.generateObject("late", z.object({ same: z.boolean() })),
            );
            return { messageId };
          },
        }),
      ],
    },
  );
  try {
    await harness.installPlugins(
      instantiatePluginPackageDefinition(
        definition,
        {},
        { name: "@brains/faq", version: "0.0.0-test" },
      ),
    );
    await harness.finalizeRegistration();
    const response = z
      .object({ messageId: z.string().min(1) })
      .parse(
        await harness.sendMessage("fixture:delivery", { messageId: "forged" }),
      );
    expect(response.messageId).not.toBe("forged");
    const store = harness.getEntityService();
    expect(
      await store.getEntityMutationReceipt({
        namespace: "faq.source-review",
        key: response.messageId,
      }),
    ).toEqual({ operation: "none" });
    expect(
      await store.getEntityMutationReceipt({
        namespace: "faq.source-review",
        key: "forged",
      }),
    ).toBeNull();
    expect(signals).toHaveLength(1);
    expect(signals[0]?.aborted).toBe(true);
    for (const call of late)
      expect(await refused(call)).toMatchObject({ code: "cancelled" });
    expect(signals).toHaveLength(1);
  } finally {
    await harness.reset();
  }
});

it("does not confer service generation or owned mutations on an interface subscription", async () => {
  const faq = defineEntity({
    type: "faq",
    purpose: "Unowned",
    metadata: z.object({}),
  });
  const harness = createPluginHarness();
  const definition = defineInterface(
    { id: "capture", config: z.object({}) },
    {
      subscriptions: () => [
        defineSubscription({
          topic: "fixture:interface",
          payload: z.object({}),
          handle: async ({ ai, entities }) => {
            expect(
              await refused(() => ai.generateObject("no", z.object({}))),
            ).toMatchObject({ code: "permission_denied" });
            expect(
              await refused(() => entities.mutations.read(faq, "one")),
            ).toMatchObject({ code: "permission_denied" });
            return { checked: true };
          },
        }),
      ],
    },
  );
  try {
    await harness.installPlugins(
      instantiatePluginPackageDefinition(
        definition,
        {},
        { name: "@brains/faq", version: "0.0.0-test" },
      ),
    );
    await harness.finalizeRegistration();
    const response: unknown = await harness.sendMessage(
      "fixture:interface",
      {},
    );
    expect(response).toEqual({
      checked: true,
    });
  } finally {
    await harness.reset();
  }
});
