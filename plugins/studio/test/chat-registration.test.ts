import { EntityRegistry } from "@brains/entity-service";
import { createSilentLogger } from "@brains/test-utils";
import { describe, expect, it, spyOn } from "bun:test";
import { createMockShell } from "@brains/plugins/test";
import type {
  RegisteredWebRoute,
  ResolvedInboxFollowUp,
} from "@brains/plugins";
import { studioPlugin } from "../src";
import { STUDIO_CHAT_ROUTE_PATH } from "../src/chat-workspace";
import { createStudioChatHandoffState } from "../src/chat-handoff-contract";

describe("Studio owns operator Chat navigation", () => {
  for (const chatFirst of [false, true]) {
    it(`registers Chat regardless of route initialization order (chatFirst=${chatFirst})`, async () => {
      const shell = createMockShell();
      spyOn(shell, "getEntityRegistry").mockReturnValue(
        EntityRegistry.createFresh(createSilentLogger()),
      );
      const studio = studioPlugin({ routePath: "/authoring" });
      // Production catalogs every configured plugin before initializing any.
      shell.addPlugin({
        id: "web-chat",
        version: "0.0.0-test",
        type: "interface",
        packageName: "@brains/web-chat",
        register: async () => ({ tools: [], resources: [] }),
      });
      const addChat = (): void => {
        shell.getPluginWebRoutes = (): RegisteredWebRoute[] =>
          ["/api/talk", "/api/talk/actions"].map((path) => ({
            pluginId: "web-chat",
            fullPath: path,
            definition: {
              path,
              method: "POST",
              handler: (): Response => new Response(),
            },
          }));
      };
      if (chatFirst) addChat();
      else
        shell.getPluginWebRoutes = (): never => {
          throw new Error("HTTP route registry has not been finalized");
        };
      await studio.register(shell);
      if (!chatFirst) addChat();
      // Production freezes follow-ups before plugin finalization.
      shell.getInboxFollowUpRegistry().finalize();
      await studio.finalizeRegistration();
      expect(
        shell.listInteractions().filter((entry) => entry.label === "Chat"),
      ).toEqual([
        expect.objectContaining({
          id: "chat",
          pluginId: "studio",
          href: STUDIO_CHAT_ROUTE_PATH,
          visibility: "trusted",
          requiresActiveSession: true,
        }),
      ]);
      expect(
        shell.listEndpoints().filter((entry) => entry.label === "Chat"),
      ).toEqual([
        expect.objectContaining({
          pluginId: "studio",
          url: STUDIO_CHAT_ROUTE_PATH,
        }),
      ]);
      const registry = shell.getInboxFollowUpRegistry();
      expect(registry.getKind("discuss-in-chat")).toMatchObject({
        label: "Discuss in chat",
        mode: "universal",
        permissionLevel: "trusted",
      });
      const item = {
        id: "mail-1",
        title: "Review message",
        receivedAt: "2026-09-27T08:00:00.000Z",
        urgency: "high" as const,
        actions: [],
      };
      const resolve = (
        permissionLevel: "public" | "trusted" | "admin",
        title = item.title,
      ): Promise<ResolvedInboxFollowUp[]> =>
        registry.resolveUniversal({
          sourceId: "mail-items",
          actor: { permissionLevel },
          item: { ...item, title },
        });
      shell.getInboxRegistry().registerSource("mail", {
        sourceId: "mail-items",
        displayName: "Mail",
        list: async () => [],
        resolveDetail: async () => ({
          kind: "plain",
          text: "Private",
          truncated: false,
        }),
        act: async () => {},
      });
      shell.getInboxRegistry().finalize();
      expect(
        await registry.resolveUniversal({
          sourceId: "missing",
          actor: { permissionLevel: "admin" },
          item,
        }),
      ).toEqual([]);
      expect(await resolve("public")).toEqual([]);
      for (const role of ["trusted", "admin"] as const) {
        expect(await resolve(role)).toEqual([
          {
            kind: "discuss-in-chat",
            label: "Discuss in chat",
            href: STUDIO_CHAT_ROUTE_PATH,
            state: {
              ...createStudioChatHandoffState(
                "mail-items",
                "mail-1",
                "Review message",
              ),
            },
          },
        ]);
      }
      expect(await resolve("admin", "\u0000" + "x".repeat(159))).toEqual([
        expect.objectContaining({
          state: createStudioChatHandoffState(
            "mail-items",
            "mail-1",
            "x".repeat(159),
          ),
        }),
      ]);
    });
  }

  it("registers neither Chat nor its follow-up without web-chat", async () => {
    const shell = createMockShell();
    spyOn(shell, "getEntityRegistry").mockReturnValue(
      EntityRegistry.createFresh(createSilentLogger()),
    );
    const studio = studioPlugin();
    await studio.register(shell);
    shell.getInboxFollowUpRegistry().finalize();
    await studio.finalizeRegistration();
    expect(
      shell.listInteractions().some((entry) => entry.label === "Chat"),
    ).toBe(false);
    expect(shell.listEndpoints().some((entry) => entry.label === "Chat")).toBe(
      false,
    );
    expect(
      shell.getInboxFollowUpRegistry().getKind("discuss-in-chat"),
    ).toBeUndefined();
  });
});
