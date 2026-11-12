import { describe, expect, it } from "bun:test";
import {
  EntityActionPermissionError,
  PermissionService,
} from "@brains/templates";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type Plugin,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service converted from a class checks the brain's entity
 * action policy for a caller as its class did through
 * context.permissions.assertEntityActionAllowed: a caller below the level a
 * type's action needs is refused, one at it passes, and an action nobody
 * restricted passes. Content-pipeline checks who may queue and publish a
 * type this way.
 */

async function runtimeOn(shell: MockShell): Promise<{
  runtime: ServiceRuntime;
  plugin: Plugin;
}> {
  let runtime: ServiceRuntime | undefined;
  const [plugin] = instantiatePluginPackageDefinition(
    defineServicePlugin({
      id: "probe",
      config: z.object({}),
      setup: (context) => {
        runtime = serviceRuntime(context);
        return {};
      },
    }),
    {},
    { name: "@brains/probe", version: "0.1.0" },
    { pluginId: "probe" },
  );
  if (!plugin) throw new Error("No plugin");
  await plugin.register(shell);
  if (!runtime) throw new Error("Setup did not run");
  return { runtime, plugin };
}

function brainWithPublishPolicy(): MockShell {
  const shell = createMockShell();
  const permissions = new PermissionService({
    entityActions: { "social-post": { publish: "admin" } },
  });
  shell.getPermissionService = (): PermissionService => permissions;
  return shell;
}

describe("a first-party service's entity action checks", () => {
  it("refuse a caller below the level the action needs, as its class did", async () => {
    const { runtime } = await runtimeOn(brainWithPublishPolicy());

    expect(() =>
      runtime.permissions.assertEntityActionAllowed("social-post", "publish", {
        userPermissionLevel: "trusted",
      }),
    ).toThrow(EntityActionPermissionError);
    expect(() =>
      runtime.permissions.assertEntityActionAllowed("social-post", "publish", {
        userPermissionLevel: "admin",
      }),
    ).not.toThrow();
  });

  it("pass an action no policy restricts", async () => {
    const { runtime } = await runtimeOn(brainWithPublishPolicy());

    expect(() =>
      runtime.permissions.assertEntityActionAllowed("social-post", "update", {
        userPermissionLevel: "trusted",
      }),
    ).not.toThrow();
  });
});
