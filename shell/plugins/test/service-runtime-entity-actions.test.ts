import { describe, expect, it } from "bun:test";
import {
  EntityActionPermissionError,
  PermissionService,
} from "@brains/templates";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import { probeService } from "../src/test/probe-service-runtime";

/**
 * A first-party service converted from a class checks the brain's entity
 * action policy for a caller as its class did through
 * context.permissions.assertEntityActionAllowed: a caller below the level a
 * type's action needs is refused, one at it passes, and an action nobody
 * restricted passes. Content-pipeline checks who may queue and publish a
 * type this way.
 */

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
    const { runtime } = await probeService(brainWithPublishPolicy());

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
    const { runtime } = await probeService(brainWithPublishPolicy());

    expect(() =>
      runtime.permissions.assertEntityActionAllowed("social-post", "update", {
        userPermissionLevel: "trusted",
      }),
    ).not.toThrow();
  });
});
