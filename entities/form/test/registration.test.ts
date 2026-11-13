import { describe, expect, it } from "bun:test";
import type { Plugin, PluginCapabilities } from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import { createFormPlugins } from "./form-plugins";

async function installed(): Promise<{
  shell: MockShell;
  plugins: Plugin[];
  capabilities: PluginCapabilities[];
}> {
  const shell = createMockShell();
  const plugins = createFormPlugins();
  const capabilities: PluginCapabilities[] = [];
  for (const plugin of plugins) {
    capabilities.push(await plugin.register(shell));
  }
  return { shell, plugins, capabilities };
}

const markdown = `---
target: contact-request
path: /work-with-us
title: Work with us
steps:
  - fields:
      - kind: text
        id: name
        label: Name
        required: true
---
Tell us what you have in mind.
`;

/**
 * What the form package registers, pinned as the form entity plugin class
 * registered it: a type the model never reads, that the contact and quiz
 * packages serve, refusing a form the engine would not run.
 */
describe("the form package's registered surface", () => {
  it("is the form plugin, with no tools, resources, instructions, routes, jobs, templates or data sources", async () => {
    const { shell, plugins, capabilities } = await installed();
    expect(
      plugins.map(({ id, type, packageName, dependencies }) => [
        id,
        type,
        packageName,
        dependencies ?? [],
      ]),
    ).toEqual([["form", "entity", "@brains/form", []]]);
    expect(capabilities.flatMap(({ tools }) => tools)).toEqual([]);
    expect(capabilities.flatMap(({ resources }) => resources)).toEqual([]);
    expect(
      capabilities.map(({ instructions }) => instructions ?? null),
    ).toEqual([null]);
    for (const plugin of plugins) {
      expect(plugin.getWebRoutes?.() ?? []).toEqual([]);
      expect(plugin.getApiRoutes?.() ?? []).toEqual([]);
    }
    expect(shell.getJobQueueService().getRegisteredTypes()).toEqual([]);
    expect([...shell.getTemplates().keys()]).toEqual([]);
    expect(shell.getDataSourceRegistry().list()).toEqual([]);
  });

  it("registers the form type out of the model's reach", async () => {
    const { shell } = await installed();
    const registry = shell.getEntityRegistry();
    expect(registry.getAllEntityTypes()).toEqual(["form"]);
    expect(registry.getEntityTypeConfig("form")).toMatchObject({
      embeddable: false,
      fullTextSearchable: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
    });
    expect(registry.getAdapter("form").purpose).toBe(
      "A public form on the brain's site: its fields, copy and what its submissions become. Served by the package that stores them; never knowledge or model input.",
    );
  });

  it("refuses a form the engine would not run, or whose id is not a slug, without echoing it", async () => {
    const { shell } = await installed();
    const validator = shell.getEntityRegistry().getPersistValidator("form");
    if (!validator) throw new Error("Missing persist validator");
    const entity = {
      id: "work-with-us",
      entityType: "form",
      visibility: "public" as const,
      content: markdown,
      contentHash: "x",
      created: "2026-11-07T10:00:00.000Z",
      updated: "2026-11-07T10:00:00.000Z",
      metadata: {},
    };
    expect(await validator(entity, { operation: "create" })).toBeUndefined();
    expect(
      validator(
        { ...entity, content: markdown.replace("kind: text", "kind: date") },
        { operation: "create" },
      ),
    ).rejects.toThrow(/^Invalid form$/);
    expect(
      validator({ ...entity, id: "Work With Us" }, { operation: "update" }),
    ).rejects.toThrow(/^Invalid form$/);
  });
});
