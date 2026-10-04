import { expect, test } from "bun:test";
import { createPluginHarness } from "../src/test/harness";
import type { InterfaceCaller } from "../src/interface/route-contract";

const claims: InterfaceCaller = {
  actor: { id: "someone" },
  permission: "admin",
  isAnchor: true,
};
const actor = { permissionLevel: "admin" as const };
const caught = (error: unknown): unknown => error;

test("Inbox callbacks receive the original credential separately from actor data and reject forged or mismatched presentations", async () => {
  const harness = createPluginHarness();
  const registry = harness.getMockShell().getInboxRegistry();
  const calls: unknown[] = [];
  registry.registerSource("owner", {
    sourceId: "source",
    displayName: "Source",
    list: async () => [],
    act: async (_id, _action, dto, caller) => {
      calls.push({ dto, caller });
    },
    resolveDetail: async (_id, dto, _signal, caller) => {
      calls.push({ dto, caller });
      return { kind: "plain", text: "Private", truncated: false };
    },
  });
  registry.finalize();
  const source = registry.getSource("source");
  if (!source?.resolveDetail) throw new Error("Missing source");
  expect(
    await source.act("one", "approve", actor, claims).catch(caught),
  ).toMatchObject({ code: "unauthenticated" });
  expect(
    await source
      .resolveDetail("one", actor, new AbortController().signal, claims)
      .catch(caught),
  ).toMatchObject({ code: "unauthenticated" });
  expect(calls).toHaveLength(0);
  let retained: InterfaceCaller | undefined;
  await harness.withCaller(async (caller) => {
    retained = caller;
    expect(
      await source.act("one", "approve", actor, { ...caller }).catch(caught),
    ).toMatchObject({ code: "unauthenticated" });
    expect(
      await source
        .act("one", "approve", { permissionLevel: "public" }, caller)
        .catch(caught),
    ).toMatchObject({ code: "permission_denied" });
    await source.act("one", "approve", actor, caller);
    expect(calls).toEqual([{ dto: actor, caller }]);
    const foreign = createPluginHarness();
    await foreign.withCaller(async (other) => {
      expect(
        await source.act("one", "approve", actor, other).catch(caught),
      ).toMatchObject({ code: "unauthenticated" });
    });
  });
  if (!retained) throw new Error("Missing caller");
  expect(
    await source.act("one", "approve", actor, retained).catch(caught),
  ).toMatchObject({ code: "unauthenticated" });
  expect(calls).toHaveLength(1);
});

test("Inbox detail refuses cancelled output even when its source ignores cancellation", async () => {
  const harness = createPluginHarness();
  const registry = harness.getMockShell().getInboxRegistry();
  const controller = new AbortController();
  registry.registerSource("owner", {
    sourceId: "source",
    displayName: "Source",
    list: async () => [],
    act: async () => {},
    resolveDetail: async () => {
      controller.abort();
      return { kind: "plain", text: "Private", truncated: false };
    },
  });
  registry.finalize();
  const resolve = registry.getSource("source")?.resolveDetail;
  if (!resolve) throw new Error("Missing detail");
  await harness.withCaller(async (caller) => {
    const result = await resolve("one", actor, controller.signal, caller).catch(
      caught,
    );
    expect(result).toBeInstanceOf(Error);
    expect(JSON.stringify(result)).not.toContain("Private");
  });
});
