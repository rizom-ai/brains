import { expect, test } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineEntity,
  defineEntityPackage,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type EntityInboxDeclaration,
  type EntityInboxContext,
  type EntityInboxDetailContext,
} from "../src";

for (const family of ["entity", "service"] as const)
  test(`${family} Inbox separates listing, detail and action capabilities and expires retained readers/edits`, async () => {
    const harness = createPluginHarness();
    const details: EntityInboxDetailContext[] = [];
    const actions: EntityInboxContext[] = [];
    const source: EntityInboxDeclaration = {
      sourceId: "records",
      displayName: "Records",
      list: async (context) => {
        expect("edits" in context).toBe(false);
        expect("auth" in context).toBe(false);
        expect("update" in context.entities).toBe(false);
        return [];
      },
      resolveDetail: async (context) => {
        details.push(context);
        expect("edits" in context).toBe(false);
        expect("auth" in context).toBe(false);
        expect("mutations" in context.entities).toBe(false);
        expect(context.signal.aborted).toBe(false);
        return { kind: "plain", text: "Detail", truncated: false };
      },
      act: async (context) => {
        actions.push(context);
        expect("once" in context.edits).toBe(false);
        expect("fold" in context.edits).toBe(false);
        expect("create" in context.entities).toBe(false);
        expect(context.signal.aborted).toBe(false);
        await context.edits.read(record, "missing");
      },
    };
    const record = defineEntity({
      type: "record",
      purpose: "Inbox fixture",
      metadata: z.object({}),
      ...(family === "entity" ? { inbox: source } : {}),
    });
    const definition =
      family === "entity"
        ? defineEntityPackage({ id: "records", entities: [record] })
        : defineServicePlugin(
            { id: "records", config: z.object({}), entities: [record] },
            { inbox: () => source },
          );
    const plugins = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/records", version: "1.0.0" },
    );
    for (const plugin of plugins) await harness.installPlugin(plugin);
    await harness.finalizeRegistration();
    const registered = harness
      .getMockShell()
      .getInboxRegistry()
      .getSource("records");
    if (!registered?.resolveDetail)
      throw new Error("Missing Inbox declaration");
    await registered.list();
    await harness.withCaller(async (caller) => {
      await registered.resolveDetail?.(
        "missing",
        { permissionLevel: "admin" },
        new AbortController().signal,
        caller,
      );
      await registered.act(
        "missing",
        "review",
        { permissionLevel: "admin" },
        caller,
      );
    });
    expect(details).toHaveLength(1);
    expect(actions).toHaveLength(1);
    for (const context of [...details, ...actions]) {
      expect(context.signal.aborted).toBe(true);
      const failure = await context.entities
        .getEntity({ entityType: "record", id: "missing" })
        .catch((error: unknown): unknown => error);
      expect(failure).toMatchObject({ code: "unauthenticated" });
    }
    const action = actions[0];
    if (!action) throw new Error("Missing action context");
    const failure = await action.edits
      .read(record, "missing")
      .catch((error: unknown): unknown => error);
    expect(failure).toMatchObject({ code: "unauthenticated" });
    await harness.reset();
  });
