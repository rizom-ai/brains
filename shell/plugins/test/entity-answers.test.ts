import { describe, expect, it } from "bun:test";
import { defineBusContract, SdkError } from "@brains/contracts";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  answering,
  defineEntity,
  defineEntityPackage,
  entityAnswer,
  instantiatePluginPackageDefinition,
  type AnyEntityDefinition,
  type EntityDefinition,
} from "../src";

/**
 * A first-party entity type answering a first-party contract under the
 * channel it already has, as its entity plugin class answered it: the
 * handler is given the request and the sender, and reads and writes its own
 * type as the package.
 */

const captureContract = defineBusContract({
  channel: "memo:capture",
  request: z.strictObject({ id: z.string(), body: z.string() }),
  response: z.strictObject({ memoId: z.string(), created: z.boolean() }),
  delivery: "request",
});

const memoMetadata = z.object({ title: z.string() });
type MemoDefinition = EntityDefinition<"memo", typeof memoMetadata>;

const senders: string[] = [];
const memo: MemoDefinition = answering(
  defineEntity({ type: "memo", purpose: "A memo.", metadata: memoMetadata }),
  [
    entityAnswer(captureContract, async ({ request, sender, entities }) => {
      senders.push(sender);
      if (await entities.get(memo, request.id)) {
        return { memoId: request.id, created: false };
      }
      const { id } = await entities.create(memo, {
        id: request.id,
        content: request.body,
        metadata: { title: "Captured" },
        visibility: "restricted",
      });
      return { memoId: id, created: true };
    }),
  ],
);

async function install(
  entities: readonly AnyEntityDefinition[],
): Promise<ReturnType<typeof createPluginHarness>> {
  const harness = createPluginHarness({
    logger: createSilentLogger("entity-answers"),
  });
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "memos", entities }),
    {},
    { name: "@fixture/memos", version: "0.1.0" },
  )) {
    await harness.installPlugin(plugin);
  }
  return harness;
}

describe("a first-party entity type's answers", () => {
  it("answers under the contract's own channel, as the package, with the sender", async () => {
    senders.length = 0;
    const harness = await install([memo]);
    try {
      expect(
        await harness.sendMessage(
          captureContract.name,
          { id: "first", body: "Remember this" },
          "web-chat",
        ),
      ).toEqual({ memoId: "first", created: true });
      expect(senders).toEqual(["web-chat"]);
      const stored = await harness.getEntityService().getEntity({
        entityType: "memo",
        id: "first",
        visibilityScope: "restricted",
      });
      expect(stored?.visibility).toBe("restricted");
      // A restricted record is the package's own, so it reads it back.
      expect(
        await harness.sendMessage(
          captureContract.name,
          { id: "first", body: "Again" },
          "web-chat",
        ),
      ).toEqual({ memoId: "first", created: false });
    } finally {
      await harness.reset();
    }
  });

  it("fails in its public form, its diagnostic left behind", async () => {
    const strict = answering(
      defineEntity({
        type: "memo",
        purpose: "A memo.",
        metadata: memoMetadata,
      }),
      [
        entityAnswer(captureContract, async () => {
          throw new SdkError("conflict", {
            message: "internal detail",
            publicMessage: "Already captured",
          });
        }),
      ],
    );
    const harness = await install([strict]);
    try {
      const response = await harness
        .getMockShell()
        .getMessageBus()
        .send({
          type: captureContract.name,
          payload: { id: "x", body: "y" },
          sender: "web-chat",
        });
      expect(JSON.stringify(response)).toContain("Already captured");
      expect(JSON.stringify(response)).not.toContain("internal detail");
    } finally {
      await harness.reset();
    }
  });

  it("is released when the package shuts down", async () => {
    senders.length = 0;
    const harness = await install([memo]);
    await harness.reset();
    await harness
      .getMockShell()
      .getMessageBus()
      .send({
        type: captureContract.name,
        payload: { id: "late", body: "Too late" },
        sender: "web-chat",
      });
    expect(senders).toEqual([]);
  });
});
