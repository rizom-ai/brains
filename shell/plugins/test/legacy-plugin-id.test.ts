import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  createTemplate,
  defineDataSource,
  defineEntity,
  defineEntityJob,
  defineEntityPackage,
  defineDaemon,
  defineInterface,
  defineJob,
  defineMessageInterface,
  defineMessageInterfacePackage,
  defineServicePlugin,
  defineTool,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * A first-party package converted to a definition keeps the plugin id its
 * class had, so the names derived from it — templates, data sources, jobs,
 * the plugin's channels — stay what sites, brains and queued jobs use.
 * Only the composer names it; package source never does.
 */

const doc = defineEntity({
  type: "doc",
  purpose: "A documentation page.",
  metadata: z.object({ title: z.string() }),
  templates: {
    "doc-list": createTemplate({
      name: "doc-list",
      description: "Every doc",
      schema: z.object({ title: z.string() }),
      dataSourceId: "entities",
      requiredPermission: "public",
    }),
  },
  jobs: {
    reindex: defineEntityJob({
      input: z.object({}),
      handle: async () => ({ done: true }),
    }),
  },
});

const docs = defineEntityPackage({
  id: "docs",
  entities: [doc],
  dataSources: [
    defineDataSource({
      id: "entities",
      name: "Docs",
      description: "Every doc",
      fetch: async () => ({ title: "Docs" }),
    }),
  ],
});

const metadata = { name: "@brains/doc", version: "0.1.0" };

const registryEntry = defineEntity({
  type: "registry-entry",
  purpose: "One registered thing.",
  metadata: z.object({ title: z.string() }),
});

const registry = defineServicePlugin(
  { id: "registry", config: z.object({}) },
  {
    templates: {
      summary: {
        schema: z.object({ title: z.string() }),
        format: ({ value }) => value.title,
      },
    },
    jobs: () => [
      defineJob({
        name: "refresh",
        input: z.object({}),
        output: z.object({}),
      }).handle(async () => ({})),
    ],
    tools: () => [
      defineTool({
        name: "list",
        description: "List what is registered.",
        input: z.object({}),
        output: z.object({}),
        execute: () => ({}),
      }),
    ],
  },
);

const serviceMetadata = { name: "@brains/registry", version: "0.1.0" };

async function installAll(
  plugins: ReturnType<typeof instantiatePluginPackageDefinition>,
): Promise<ReturnType<typeof createPluginHarness>> {
  const harness = createPluginHarness({ logger: createSilentLogger() });
  for (const plugin of plugins) await harness.installPlugin(plugin);
  return harness;
}

async function install(options?: { pluginId: string }): Promise<{
  pluginIds: string[];
  harness: ReturnType<typeof createPluginHarness>;
}> {
  const plugins = instantiatePluginPackageDefinition(
    docs,
    {},
    metadata,
    options,
  );
  const harness = createPluginHarness({ logger: createSilentLogger() });
  for (const plugin of plugins) await harness.installPlugin(plugin);
  return { pluginIds: plugins.map(({ id }) => id), harness };
}

describe("an entity package instantiated under a legacy plugin id", () => {
  it("registers its plugin, templates, data sources and jobs under that id", async () => {
    const { pluginIds, harness } = await install({ pluginId: "docs" });

    expect(pluginIds).toEqual(["docs"]);
    expect([...harness.getTemplates().keys()]).toEqual(["docs:doc-list"]);
    expect(harness.getTemplates().get("docs:doc-list")?.dataSourceId).toBe(
      "docs:entities",
    );
    expect([...harness.getDataSources().keys()]).toEqual(["docs:entities"]);
    expect(
      harness.getMockShell().getJobQueueService().getRegisteredTypes(),
    ).toEqual(["docs:reindex"]);
    await harness.reset();
  });

  it("keeps the package as the owner and its plugin under the package name", async () => {
    const plugins = instantiatePluginPackageDefinition(docs, {}, metadata, {
      pluginId: "docs",
    });
    expect(plugins.map(({ packageName }) => packageName)).toEqual([
      "@brains/doc",
    ]);
  });

  it("scopes every name by the package without one", async () => {
    const { pluginIds, harness } = await install();

    expect(pluginIds).toEqual(["@brains/doc:doc"]);
    expect([...harness.getTemplates().keys()]).toEqual([
      "@brains/doc:doc:doc-list",
    ]);
    expect([...harness.getDataSources().keys()]).toEqual([
      "@brains/doc:entities",
    ]);
    await harness.reset();
  });

  it("is refused for a package that installs more than one plugin", () => {
    const pair = defineEntityPackage({
      id: "pair",
      entities: [
        doc,
        defineEntity({
          type: "page",
          purpose: "A page.",
          metadata: z.object({}),
        }),
      ],
    });
    expect(() =>
      instantiatePluginPackageDefinition(pair, {}, metadata, {
        pluginId: "pair",
      }),
    ).toThrow(/one plugin/);
  });

  it("is refused when it is not a plugin identifier", () => {
    expect(() =>
      instantiatePluginPackageDefinition(registry, {}, serviceMetadata, {
        pluginId: "Registry!",
      }),
    ).toThrow();
    expect(() =>
      instantiatePluginPackageDefinition(docs, {}, metadata, {
        pluginId: "Docs!",
      }),
    ).toThrow();
  });
});

describe("a service package instantiated under a legacy plugin id", () => {
  it("registers its plugin, templates and jobs under that id, its tools by name", async () => {
    const plugins = instantiatePluginPackageDefinition(
      registry,
      {},
      serviceMetadata,
      { pluginId: "registry" },
    );
    const harness = await installAll(plugins);

    expect(plugins.map(({ id }) => id)).toEqual(["registry"]);
    expect(plugins.map(({ packageName }) => packageName)).toEqual([
      "@brains/registry",
    ]);
    expect([...harness.getTemplates().keys()]).toEqual(["registry:summary"]);
    expect(
      harness.getMockShell().getJobQueueService().getRegisteredTypes(),
    ).toEqual(["registry:refresh"]);
    expect(harness.getCapabilities().tools.map(({ name }) => name)).toEqual([
      "registry_list",
    ]);
    await harness.reset();
  });

  it("scopes its plugin by the package without one", async () => {
    const plugins = instantiatePluginPackageDefinition(
      registry,
      {},
      serviceMetadata,
    );
    const harness = await installAll(plugins);

    expect(plugins.map(({ id }) => id)).toEqual(["@brains/registry:registry"]);
    expect([...harness.getTemplates().keys()]).toEqual([
      "@brains/registry:registry:summary",
    ]);
    await harness.reset();
  });

  it("installs the one type it owns under the type's own id", () => {
    const owning = defineServicePlugin({
      id: "registry",
      config: z.object({}),
      entities: [registryEntry],
    });
    const plugins = instantiatePluginPackageDefinition(
      owning,
      {},
      serviceMetadata,
      { pluginId: "registry-metadata" },
    );
    expect(plugins.map(({ id, type }) => [id, type])).toEqual([
      ["registry-entry", "entity"],
      ["registry-metadata", "service"],
    ]);
  });

  it("is refused for a service that owns more than one type", () => {
    const owning = defineServicePlugin({
      id: "registry",
      config: z.object({}),
      entities: [registryEntry, doc],
    });
    expect(() =>
      instantiatePluginPackageDefinition(owning, {}, serviceMetadata, {
        pluginId: "registry",
      }),
    ).toThrow(/at most one entity type/);
  });
});

describe("a service's legacy plugin id beside the type it owns", () => {
  it("is refused when it is the id its type is installed under", () => {
    const owning = defineServicePlugin({
      id: "registry",
      config: z.object({}),
      entities: [registryEntry],
    });
    expect(() =>
      instantiatePluginPackageDefinition(owning, {}, serviceMetadata, {
        pluginId: "registry-entry",
      }),
    ).toThrow(/its entity type is installed under/);
  });
});

describe("a first-party service's plugin dependencies", () => {
  it("are the ones the composer names, as its class declared them", () => {
    const [plugin] = instantiatePluginPackageDefinition(
      registry,
      {},
      serviceMetadata,
      { pluginId: "registry", dependencies: ["playbook", "playbooks"] },
    );
    expect(plugin?.dependencies).toEqual(["playbook", "playbooks"]);
  });

  it("are none unless the composer names them", () => {
    const [plugin] = instantiatePluginPackageDefinition(
      registry,
      {},
      serviceMetadata,
      { pluginId: "registry" },
    );
    expect(plugin?.dependencies).toEqual([]);
  });

  it("are refused for a package that is not a service", () => {
    expect(() =>
      instantiatePluginPackageDefinition(docs, {}, metadata, {
        pluginId: "docs",
        dependencies: ["playbook"],
      }),
    ).toThrow(
      'Plugin definition "docs" is not a service package; only a service keeps the dependencies its class declared',
    );
  });
});

describe("an interface package instantiated under a legacy plugin id", () => {
  const listener = defineInterface(
    { id: "listener", config: z.object({}) },
    {
      daemons: () => [
        defineDaemon({
          id: "events",
          run: async ({ signal, health }) => {
            health.ready();
            await new Promise<void>((resolve) => {
              signal.addEventListener("abort", () => resolve(), {
                once: true,
              });
            });
          },
        }),
      ],
    },
  );
  const inbox = defineMessageInterface(
    {
      id: "inbox",
      config: z.object({}),
      channel: {
        type: "inbox",
        displayName: "Inbox",
        subjectLabel: "Address",
        recipient: z.string(),
      },
    },
    { deliver: () => undefined },
  );
  const interfaceMetadata = { name: "@brains/listener", version: "0.1.0" };

  it("registers a generic interface and its daemons under that id", async () => {
    const [plugin] = instantiatePluginPackageDefinition(
      listener,
      {},
      interfaceMetadata,
      { pluginId: "listener" },
    );
    if (!plugin) throw new Error("No plugin was created");
    const harness = createPluginHarness({ logger: createSilentLogger() });
    await harness.installPlugin(plugin);

    expect([plugin.id, plugin.packageName]).toEqual([
      "listener",
      "@brains/listener",
    ]);
    expect(harness.getMockShell().getDaemonRegistry().getAll()).toEqual([
      "listener:events",
    ]);
  });

  it("registers a message interface under that id", () => {
    const [plugin] = instantiatePluginPackageDefinition(
      inbox,
      {},
      interfaceMetadata,
      { pluginId: "inbox" },
    );
    expect(plugin?.id).toBe("inbox");
  });

  it("scopes an interface by the package without one", () => {
    const [plugin] = instantiatePluginPackageDefinition(
      listener,
      {},
      interfaceMetadata,
    );
    expect(plugin?.id).toBe("@brains/listener:listener");
  });

  it("is refused for a package of several message interfaces", () => {
    const mailboxes = defineMessageInterfacePackage({
      id: "mailboxes",
      config: z.object({}),
      interfaces: () => [],
    });
    expect(() =>
      instantiatePluginPackageDefinition(mailboxes, {}, interfaceMetadata, {
        pluginId: "mailboxes",
      }),
    ).toThrow(
      'Message interface package "mailboxes" keeps no legacy plugin id; each of its interfaces is its own plugin',
    );
  });
});
