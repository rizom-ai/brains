import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createSilentLogger } from "@brains/test-utils";
import { createMockShell } from "../src/test/mock-shell";
import {
  defineInterface,
  defineMessageInterface,
  defineStudioWorkspace,
  defineWorkspaceAction,
  instantiatePluginPackageDefinition,
  STUDIO_WORKSPACE_REGISTER_MESSAGE,
  STUDIO_WORKSPACE_UNREGISTER_MESSAGE,
  type StudioWorkspaceRegistration,
  type StudioWorkspaceActor,
} from "../src";

const action = defineWorkspaceAction({
  name: "open",
  label: "Open",
  permission: "admin",
  confirmation: { kind: "prepared" },
  input: z.object({}),
  output: z.object({ open: z.boolean() }),
});
const workspace = defineStudioWorkspace({
  id: "monitor",
  label: "Monitor",
  permission: "admin",
  data: z.object({ open: z.boolean() }),
  actions: [action],
  view: () => ({ title: "Monitor", blocks: [] }),
});
function actor(permission: "public" | "admin"): StudioWorkspaceActor {
  return {
    interfaceType: "studio",
    userId: permission,
    actor: { kind: "user", userId: permission },
    userPermissionLevel: permission,
    visibilityScope: permission === "admin" ? "restricted" : "public",
    isAnchor: permission === "admin",
  };
}

describe("declarative interface operator contributions", () => {
  it.each(["worker", "rollback"] as const)(
    "handles %s without leaked registrations",
    async (mode) => {
      const shell = createMockShell({
        logger: createSilentLogger("interface-registration"),
      });
      const registered: StudioWorkspaceRegistration[] = [];
      const removed: unknown[] = [];
      let factories = 0;
      shell
        .getMessageBus()
        .subscribe<StudioWorkspaceRegistration>(
          STUDIO_WORKSPACE_REGISTER_MESSAGE,
          (message) => {
            if (registered.length === 1)
              return { success: false, error: "Host rejected workspace" };
            registered.push(message.payload);
            return { success: true, data: { workspaceUrl: "/studio/first" } };
          },
        );
      shell
        .getMessageBus()
        .subscribe(STUDIO_WORKSPACE_UNREGISTER_MESSAGE, (message) => {
          removed.push(message.payload);
          return { success: true };
        });
      const definitions = ["first", "second"].map((id) =>
        defineStudioWorkspace({
          id,
          label: id,
          permission: "admin",
          data: z.object({}),
          actions: [],
          view: () => ({ blocks: [] }),
        }),
      );
      const [plugin] = instantiatePluginPackageDefinition(
        defineInterface(
          { id: "web", config: z.object({}), setup: () => ({}) },
          {
            studioWorkspaces: (binding) => {
              factories++;
              return definitions.map((definition) =>
                definition.bind(binding, { actions: [], load: () => ({}) }),
              );
            },
            health: () => ({
              recording: (): { status: "healthy"; message: string } => ({
                status: "healthy",
                message: "Recording",
              }),
            }),
          },
        ),
        {},
        { name: "@fixture/interface-registration", version: "0.0.0" },
      );
      if (!plugin) throw new Error("Missing interface");
      try {
        await plugin.register(shell, { executionOnly: mode === "worker" });
        const result = await plugin
          .finalizeRegistration?.()
          .catch((error: unknown) => error);
        if (mode === "worker") {
          expect(factories).toBe(0);
          expect(registered).toHaveLength(0);
          expect(removed).toHaveLength(0);
        } else {
          expect(result).toBeInstanceOf(Error);
          expect(registered).toHaveLength(1);
          expect(removed).toHaveLength(1);
          const registration = registered[0];
          if (!registration) throw new Error("Missing first registration");
          const stopped = await registration
            .dataProvider(actor("admin"), {}, new AbortController().signal)
            .catch((error: unknown) => error);
          expect(stopped).toBeInstanceOf(Error);
        }
        expect(
          await shell.getOperationalHealthRegistry().getChecks(),
        ).toHaveLength(0);
      } finally {
        await plugin.shutdown?.();
      }
    },
  );
  for (const family of ["interface", "message-interface"] as const) {
    it(`${family} gates actions and releases owned registrations on shutdown`, async () => {
      const shell = createMockShell({
        logger: createSilentLogger("interface-operators"),
      });
      const registered: StudioWorkspaceRegistration[] = [];
      const removed: unknown[] = [];
      shell
        .getMessageBus()
        .subscribe<StudioWorkspaceRegistration>(
          STUDIO_WORKSPACE_REGISTER_MESSAGE,
          (message) => {
            registered.push(message.payload);
            return { success: true, data: { workspaceUrl: "/studio/monitor" } };
          },
        );
      shell
        .getMessageBus()
        .subscribe(STUDIO_WORKSPACE_UNREGISTER_MESSAGE, (message) => {
          removed.push(message.payload);
          return { success: true };
        });
      const header = {
        id: "web",
        config: z.object({}),
        setup: (): { open: boolean } => ({ open: false }),
      };
      const behavior = {
        studioWorkspaces: (binding: {
          config: object;
          state: { open: boolean };
          accountSettings: undefined;
        }): ReturnType<
          typeof workspace.bind<object, { open: boolean }, undefined>
        >[] => [
          workspace.bind(binding, {
            load: ({ state }) => ({ open: state.open }),
            actions: [
              action.bind(
                binding,
                ({ state }) => {
                  state.open = true;
                  return { open: true };
                },
                () => ({ summary: "Open?", revision: "1" }),
              ),
            ],
          }),
        ],
        health: (): Record<
          string,
          () => { status: "healthy"; message: string }
        > => ({
          record: (): { status: "healthy"; message: string } => ({
            status: "healthy",
            message: "Recording",
          }),
        }),
      };
      const definition =
        family === "interface"
          ? defineInterface(header, behavior)
          : defineMessageInterface(
              {
                ...header,
                channel: {
                  type: "test",
                  displayName: "Test",
                  subjectLabel: "User",
                  recipient: z.string(),
                  conversationKey: "channel",
                },
              },
              behavior,
            );
      const [plugin] = instantiatePluginPackageDefinition(
        definition,
        {},
        { name: "@fixture/interface-operators", version: "0.0.0" },
      );
      if (!plugin) throw new Error("Missing interface");
      try {
        await plugin.register(shell);
        expect(registered).toHaveLength(0);
        await plugin.finalizeRegistration?.();
        expect(registered).toHaveLength(1);
        const registration = registered[0];
        if (!registration) throw new Error("Missing workspace");
        expect(registration.id).toContain("@fixture/interface-operators");
        expect(await registration.accessHandler(actor("public"))).toBe(false);
        expect(await registration.accessHandler(actor("admin"))).toBe(true);
        const refused = await Promise.resolve(
          registration.actionHandler?.(
            { actionId: "open", input: {} },
            actor("admin"),
          ),
        ).catch((error: unknown) => error);
        expect(refused).toBeInstanceOf(Error);
        expect(
          await shell.getOperationalHealthRegistry().getChecks(),
        ).toHaveLength(1);
        await plugin.shutdown?.();
        expect(removed).toHaveLength(1);
        expect(
          await shell.getOperationalHealthRegistry().getChecks(),
        ).toHaveLength(0);
        const stopped = await registration
          .dataProvider(actor("admin"), {}, new AbortController().signal)
          .catch((error: unknown) => error);
        expect(stopped).toBeInstanceOf(Error);
      } finally {
        await plugin.shutdown?.();
      }
    });
  }
});
