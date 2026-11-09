import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineEntity,
  defineEntityPackage,
  entityRuntime,
  instantiatePluginPackageDefinition,
  type CreateExecutionContext,
  type EntityCreateCaller,
} from "../src";

/**
 * A first-party create route knows who asked, as the link plugin class's
 * interceptor read its execution context to name where a link came from
 * and whom its capture job reports to: the interface, the signed-in user,
 * and the channel, when there is one. Its check knows too.
 */

const seen: Array<{ where: string; caller: EntityCreateCaller }> = [];

const link = defineEntity({
  type: "link",
  purpose: "A saved page.",
  metadata: z.object({ title: z.string() }),
  create: {
    fromPrompt: {
      check: async (context) => {
        seen.push({ where: "check", caller: entityRuntime(context).caller });
        return { kind: "ready" };
      },
      resolve: async (context) => {
        seen.push({ where: "resolve", caller: entityRuntime(context).caller });
        return { refuse: "seen" };
      },
    },
  },
});

async function ask(caller: CreateExecutionContext): Promise<void> {
  const harness = createPluginHarness({
    logger: createSilentLogger("create-caller"),
  });
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "links", entities: [link] }),
    {},
    { name: "@fixture/links", version: "0.1.0" },
  )) {
    await harness.installPlugin(plugin);
  }
  try {
    const input = { entityType: "link", prompt: "Save it" };
    await harness.getEntityRegistry().getCreateCheck("link")?.(input, caller);
    await harness.getEntityRegistry().getCreateInterceptor("link")?.(
      input,
      caller,
    );
  } finally {
    await harness.reset();
  }
}

describe("a create route's caller", () => {
  it("is the interface, the signed-in user and the channel", async () => {
    seen.length = 0;
    await ask({
      interfaceType: "matrix",
      actor: { kind: "user", userId: "usr_1" },
      userPermissionLevel: "admin",
      channelId: "!room:server",
      channelName: "#engineering",
    });
    const caller: EntityCreateCaller = {
      interfaceType: "matrix",
      actor: { kind: "user", userId: "usr_1" },
      userId: "usr_1",
      channelId: "!room:server",
      channelName: "#engineering",
    };
    expect(seen).toEqual([
      { where: "check", caller },
      { where: "resolve", caller },
    ]);
  });

  it("names no user or channel when there is none", async () => {
    seen.length = 0;
    await ask({
      interfaceType: "mcp",
      actor: { kind: "service", serviceId: "agent" },
      userPermissionLevel: "admin",
    });
    expect(seen.map(({ caller }) => caller)).toEqual([
      { interfaceType: "mcp", actor: { kind: "service", serviceId: "agent" } },
      { interfaceType: "mcp", actor: { kind: "service", serviceId: "agent" } },
    ]);
  });
});
