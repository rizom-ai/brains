import { describe, expect, it } from "bun:test";
import { createChatApiPaths } from "@brains/contracts/chat";
import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createStubAuth } from "@brains/plugins/test";
import webChatPackage from "../src";
import packageJson from "../package.json";

/**
 * Where the headless Chat transport is mounted.
 *
 * Every operation hangs off the configured API path, so a deployment that
 * moves it moves all of them together — a route that hardcoded `/api/chat`
 * would keep answering at the old address after the move.
 */
describe("Web Chat public API routes", () => {
  it("registers every headless Chat operation below the configured API path", async () => {
    const apiPath = "/custom/chat-api";
    const paths = createChatApiPaths(apiPath);

    const harness = createPluginHarness();
    harness.getMockShell().getAuthRegistry().register(createStubAuth());
    bindPluginPackageMetadata(webChatPackage, {
      name: packageJson.name,
      version: packageJson.version,
    });
    const plugin = instantiatePluginPackageDefinition(
      webChatPackage,
      { apiPath },
      { name: packageJson.name, version: packageJson.version },
    )[0];
    if (!plugin) throw new Error("Web chat interface plugin was not created");
    await harness.installPlugin(plugin);

    const registered = new Set(
      harness
        .getMockShell()
        .getPluginWebRoutes()
        .map((route) => route.fullPath),
    );

    expect(registered).toContain(paths.stream);
    expect(registered).toContain(paths.actions);
    expect(registered).toContain(paths.sessions);
    expect(registered).toContain(paths.sessionArchive);
    expect(registered).toContain(paths.messages);
    expect(registered).toContain(paths.uploads);
    expect(registered).toContain(paths.contextSessions);
    expect(registered).toContain(paths.documentAttachments);
    expect(registered).toContain(paths.imageAttachments);
    expect(registered).toContain(paths.jobStatus);
    expect(registered).not.toContain("/api/chat/sessions");

    await harness.reset();
  });
});
