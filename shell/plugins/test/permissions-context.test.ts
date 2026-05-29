import { describe, expect, it } from "bun:test";
import {
  PermissionService,
  EntityActionPermissionError,
} from "@brains/templates";
import { createEntityPluginContext } from "../src/entity/context";
import { createServicePluginContext } from "../src/service/context";
import { createMockShell } from "../src/test/mock-shell";

function createShellWithPublishPolicy() {
  const shell = createMockShell();
  shell.getPermissionService = () =>
    new PermissionService({
      entityActions: { "social-post": { publish: "anchor" } },
    });
  return shell;
}

describe("plugin context permissions", () => {
  it("exposes entity action policy assertions to entity plugins", () => {
    const context = createEntityPluginContext(
      createShellWithPublishPolicy(),
      "social-media",
    );

    expect(() =>
      context.permissions.assertEntityActionAllowed("social-post", "publish", {
        userPermissionLevel: "trusted",
      }),
    ).toThrow(EntityActionPermissionError);

    expect(() =>
      context.permissions.assertEntityActionAllowed("social-post", "publish", {
        userPermissionLevel: "anchor",
      }),
    ).not.toThrow();
  });

  it("exposes entity action policy assertions to service plugins", () => {
    const context = createServicePluginContext(
      createShellWithPublishPolicy(),
      "content-pipeline",
    );

    expect(() =>
      context.permissions.assertEntityActionAllowed("social-post", "publish", {
        userPermissionLevel: "trusted",
      }),
    ).toThrow(EntityActionPermissionError);

    expect(() =>
      context.permissions.assertEntityActionAllowed("social-post", "publish", {
        userPermissionLevel: "anchor",
      }),
    ).not.toThrow();
  });
});
