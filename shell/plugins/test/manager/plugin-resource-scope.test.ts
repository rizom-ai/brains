import { z } from "@brains/utils/zod";
import { describe, expect, it, mock } from "bun:test";
import { baseEntitySchema } from "@brains/entity-service";
import { createTestEntityAdapter } from "@brains/entity-service/test";
import { createMockShell } from "../../src/test/mock-shell";
import {
  createPluginScopedShell,
  PluginResourceScope,
} from "../../src/manager/plugin-resource-scope";

describe("Plugin resource acquisition", () => {
  it.each(["closing", "closed"] as const)(
    "rejects registry mutation while %s before acquiring resources",
    async (state) => {
      const shell = createMockShell();
      const scope = new PluginResourceScope();
      const scoped = createPluginScopedShell(shell, scope);
      const closing = scope.close();
      if (state === "closed") await closing;
      const acquisitions = [
        (): unknown =>
          scoped
            .getAttachmentRegistry()
            .register("late", "preview", { resolve: () => undefined }),
        (): unknown =>
          scoped
            .getEntityRegistry()
            .registerEntityType(
              "late",
              baseEntitySchema,
              createTestEntityAdapter("late"),
            ),
        (): unknown =>
          scoped
            .getDataSourceRegistry()
            .register({ id: "late", name: "Late source" }),
        (): unknown =>
          scoped.getAnalyticsRegistry().register({
            type: "late",
            description: "Too late.",
            params: z.object({}),
            handler: async () => ({}),
          }),
        (): unknown =>
          scoped
            .getOperationalHealthRegistry()
            .register("late", "check", () => ({ status: "healthy" })),
        (): unknown =>
          scoped.getInboxRegistry().registerSource("late", {
            sourceId: "late",
            displayName: "Late source",
            list: async () => [],
            act: async () => undefined,
          }),
        (): unknown =>
          scoped.getInboxFollowUpRegistry().registerKind("late", {
            kind: "late",
            label: "Late follow-up",
            priority: 1,
            mode: "universal",
            permissionLevel: "admin",
            applies: () => true,
            resolve: () => ({ href: "/late" }),
          }),
        (): unknown =>
          scoped
            .getMessageBus()
            .subscribe("late:event", () => ({ success: true })),
        (): unknown =>
          scoped
            .getMessageBus()
            .observe("late:event", () => ({ success: true })),
      ];
      try {
        for (const acquire of acquisitions)
          expect(acquire).toThrow("after plugin teardown");
        expect(
          shell.getAttachmentRegistry().hasProvider("late", "preview"),
        ).toBe(false);
        expect(shell.getEntityRegistry().hasEntityType("late")).toBe(false);
        expect(shell.getDataSourceRegistry().has("shell:late")).toBe(false);
        expect(
          shell
            .getAnalyticsRegistry()
            .getDefinitions()
            .map((definition) => definition.type),
        ).not.toContain("late");
        expect(await shell.getOperationalHealthRegistry().getChecks()).toEqual(
          [],
        );
        shell.getInboxRegistry().finalize();
        shell.getInboxFollowUpRegistry().finalize();
        expect(shell.getInboxRegistry().listSources()).toEqual([]);
        expect(shell.getInboxFollowUpRegistry().listKinds()).toEqual([]);
        expect(shell.getMessageBus().getHandlerCount("late:event")).toBe(0);
      } finally {
        await closing;
      }
    },
  );

  it("admits a plugin's observer to peer and local events until its scope closes", async () => {
    const shell = createMockShell();
    const scope = new PluginResourceScope();
    const scoped = createPluginScopedShell(shell, scope);
    const seen: unknown[] = [];
    scoped.getMessageBus().observe("entity:updated", (message) => {
      seen.push(message.payload);
      return { success: true };
    });
    const bus = shell.getMessageBus();
    const local = (entityId: string): Promise<unknown> =>
      bus.send({
        type: "entity:updated",
        payload: { entityId },
        sender: "test",
        broadcast: true,
      });

    await bus.deliverPeer("entity:updated", { entityId: "peer" });
    await local("local");
    await scope.close();
    await bus.deliverPeer("entity:updated", { entityId: "after" });
    await local("after");

    expect(seen).toEqual([{ entityId: "peer" }, { entityId: "local" }]);
  });

  it("owns a successful acquisition and releases it once", async () => {
    const scope = new PluginResourceScope();
    const resource = { id: "owned" };
    const release = mock((_resource: typeof resource): void => {});
    expect(scope.acquire(() => resource, release)).toBe(resource);
    const firstClose = scope.close();
    expect(scope.close()).toBe(firstClose);
    await firstClose;
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith(resource);
  });

  it("rolls back acquisition if it re-enters teardown before ownership attaches", async () => {
    const scope = new PluginResourceScope();
    const resource = { id: "reentrant" };
    const release = mock((_resource: typeof resource): void => {});
    expect(() =>
      scope.acquire(() => {
        void scope.close();
        return resource;
      }, release),
    ).toThrow("after plugin teardown");
    await scope.close();
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith(resource);
  });

  it("does not release a resource whose acquisition failed", async () => {
    const scope = new PluginResourceScope();
    const release = mock((): void => {});
    expect(() =>
      scope.acquire((): never => {
        throw new Error("acquisition failed");
      }, release),
    ).toThrow("acquisition failed");
    await scope.close();
    expect(release).not.toHaveBeenCalled();
  });
});
