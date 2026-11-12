import { describe, expect, it, spyOn } from "bun:test";
import { z } from "@brains/utils/zod";
import { createElement as h } from "react";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  createTemplate,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party site builder converted from a class reads the brain's view
 * templates and resolves a section's content through a template as its
 * class did: every registered view by name, and a template's content by
 * its full name or one local to the plugin, handed to the content service
 * with the options the build names.
 */

const hero = createTemplate({
  name: "hero",
  description: "A hero section",
  schema: z.object({ headline: z.string() }),
  basePrompt: "",
  requiredPermission: "public",
  layout: { component: () => h("section", {}) },
});

async function runtimeOn(shell: MockShell): Promise<ServiceRuntime> {
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
  await plugin?.register(shell);
  if (!runtime) throw new Error("Setup did not run");
  return runtime;
}

describe("a first-party service's views and template content", () => {
  it("reads every registered view by name, as its class did", async () => {
    const shell = createMockShell();
    shell.registerTemplates({ hero }, "landing");
    const runtime = await runtimeOn(shell);

    expect(runtime.views.list().map(({ name }) => name)).toContain(
      "landing:hero",
    );
    expect(runtime.views.get("landing:hero")?.description).toBe(
      "A hero section",
    );
    expect(runtime.views.get("landing:missing")).toBeUndefined();
  });

  it("resolves a template's content through the content service, scoped to the plugin", async () => {
    const shell = createMockShell();
    const asked: unknown[] = [];
    spyOn(shell.getContentService(), "resolveContent").mockImplementation(
      async (templateName, options, pluginId) => {
        asked.push({ templateName, options, pluginId });
        return { headline: "Welcome" };
      },
    );
    const runtime = await runtimeOn(shell);
    const options = {
      savedContent: { entityType: "site-content", entityId: "home:hero" },
      fallback: { headline: "Welcome" },
      visibilityScope: "public" as const,
    };

    expect(await runtime.resolveTemplate("landing:hero", options)).toEqual({
      headline: "Welcome",
    });
    expect(await runtime.resolveTemplate("hero")).toEqual({
      headline: "Welcome",
    });
    // The content service scopes a local name to the plugin and keeps a full one.
    expect(asked).toEqual([
      { templateName: "landing:hero", options, pluginId: "probe" },
      { templateName: "hero", options: undefined, pluginId: "probe" },
    ]);
  });
});
