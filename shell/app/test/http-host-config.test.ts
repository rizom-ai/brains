import { describe, expect, test } from "bun:test";
import type { IShell, Plugin, PluginCapabilities } from "@brains/plugins";
import { caughtError } from "@brains/test-utils";
import { defineBrain, type PluginConfig } from "../src/brain-definition";
import { resolve } from "../src/brain-resolver";
import { parseInstanceOverrides } from "../src/instance-overrides";
import { buildShellConfig } from "../src/shell-config";
import type { AppConfig } from "../src/types";

interface ConfiguredPlugin extends Plugin {
  readonly config: PluginConfig;
}

function plugin(
  id: string,
  type: Plugin["type"],
  config: PluginConfig,
): ConfiguredPlugin {
  return {
    id,
    version: "1.0.0",
    packageName: `@brains/${id}`,
    type,
    config,
    register: async (_shell: IShell): Promise<PluginCapabilities> => ({
      tools: [],
      resources: [],
    }),
  };
}

function thrownBy(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    return caughtError(error);
  }
  throw new Error("Expected the call to throw");
}

function isConfigured(candidate: Plugin): candidate is ConfiguredPlugin {
  return "config" in candidate;
}

function configOf(config: AppConfig, id: string): PluginConfig {
  const found = config.plugins?.find((candidate) => candidate.id === id);
  if (!found || !isConfigured(found)) {
    throw new Error(`No resolved plugin "${id}"`);
  }
  return found.config;
}

/** A canonical-shaped brain: core without HTTP, web and site with it. */
const brain = defineBrain({
  name: "test",
  version: "1.0.0",
  bundles: [
    { id: "core", members: ["mcp"] },
    { id: "web", members: ["dashboard"], http: true },
    { id: "site", members: ["site-builder"] },
  ],
  capabilities: [
    [
      "dashboard",
      (config: PluginConfig): Plugin => plugin("dashboard", "service", config),
      {},
    ],
    [
      "site-builder",
      (config: PluginConfig): Plugin =>
        plugin("site-builder", "service", config),
      {},
    ],
  ],
  interfaces: [
    [
      "mcp",
      (config: PluginConfig): Plugin => plugin("mcp", "interface", config),
      (): PluginConfig => ({}),
    ],
  ],
});

function shellHttp(config: AppConfig): unknown {
  return buildShellConfig(config).http;
}

describe("the runtime's HTTP host configuration", () => {
  test("a brain serves HTTP where its bundles host the web surface", () => {
    const core = resolve(brain, {}, { bundles: ["core"] });
    const web = resolve(brain, {}, { bundles: ["core", "web"] });

    expect(core.http.enabled).toBe(false);
    expect(configOf(core, "mcp")).toEqual({ transport: "stdio" });
    expect(web.http.enabled).toBe(true);
    expect(configOf(web, "mcp")).toEqual({ transport: "http" });
  });

  test("an eval run serves no HTTP from its bundles", () => {
    const evalRun = resolve(
      brain,
      {},
      { bundles: ["core", "web"], mode: "eval" },
    );

    expect(evalRun.http.enabled).toBe(false);
    expect(configOf(evalRun, "mcp")).toEqual({ transport: "stdio" });
  });

  test("a definition that hosts HTTP itself serves it in every mode", () => {
    const hosting = defineBrain({
      name: "hosting",
      version: "1.0.0",
      http: true,
      capabilities: [],
      interfaces: [
        [
          "mcp",
          (config: PluginConfig): Plugin => plugin("mcp", "interface", config),
          (): PluginConfig => ({}),
        ],
      ],
    });

    expect(resolve(hosting, {}).http.enabled).toBe(true);
    expect(resolve(hosting, {}, { mode: "eval" }).http.enabled).toBe(true);
  });

  test("brain.yaml's http.enabled decides, and the MCP transport follows it", () => {
    const off = resolve(
      brain,
      {},
      {
        bundles: ["core", "web"],
        http: { enabled: false },
      },
    );
    const on = resolve(
      brain,
      {},
      { bundles: ["core"], http: { enabled: true } },
    );

    expect(off.http.enabled).toBe(false);
    expect(configOf(off, "mcp")).toEqual({ transport: "stdio" });
    expect(on.http.enabled).toBe(true);
    expect(configOf(on, "mcp")).toEqual({ transport: "http" });
  });

  test("an explicit MCP transport wins over the one HTTP hosting implies", () => {
    const config = resolve(
      brain,
      {},
      {
        bundles: ["core", "web"],
        plugins: { mcp: { transport: "stdio" } },
      },
    );

    expect(configOf(config, "mcp")).toEqual({ transport: "stdio" });
  });

  test("preview is served where a site builder runs, unless brain.yaml says", () => {
    expect(resolve(brain, {}, { bundles: ["web"] }).http.preview).toBe(false);
    expect(resolve(brain, {}, { bundles: ["web", "site"] }).http.preview).toBe(
      true,
    );
    expect(
      resolve(brain, {}, { bundles: ["web", "site"], http: { preview: false } })
        .http.preview,
    ).toBe(false);
  });

  test("a deployed brain without a port listens on 8080 and links to it", () => {
    const shellConfig = buildShellConfig(
      resolve(brain, {}, { bundles: ["web"], domain: "brain.example.test" }),
    );

    expect(shellConfig.http).toEqual({
      enabled: true,
      preview: false,
      port: 8080,
    });
    expect(shellConfig.localSiteUrl).toBe("http://localhost:8080");
    expect(shellConfig.siteBaseUrl).toBe("brain.example.test");
  });

  test("brain.yaml's port is the port the brain listens on and links to", () => {
    const shellConfig = buildShellConfig(
      resolve(brain, {}, { bundles: ["web"], port: 9000 }),
    );

    expect(shellConfig.http).toMatchObject({ enabled: true, port: 9000 });
    expect(shellConfig.localSiteUrl).toBe("http://localhost:9000");
  });

  test("a definition's production port is the port it listens on and links to", () => {
    const withPort = defineBrain({
      name: "ported",
      version: "1.0.0",
      http: true,
      deployment: { ports: { production: 9100 } },
      capabilities: [],
      interfaces: [],
    });

    const shellConfig = buildShellConfig(resolve(withPort, {}));
    expect(shellConfig.http).toMatchObject({ port: 9100 });
    expect(shellConfig.localSiteUrl).toBe("http://localhost:9100");

    const overridden = buildShellConfig(resolve(withPort, {}, { port: 9200 }));
    expect(overridden.http).toMatchObject({ port: 9200 });
    expect(overridden.localSiteUrl).toBe("http://localhost:9200");
  });

  test("brain.yaml's bind address and site directories reach the host", () => {
    const config = resolve(
      brain,
      {},
      {
        bundles: ["web"],
        http: {
          hostname: "127.0.0.1",
          productionDistDir: "./public",
          previewDistDir: "./public-preview",
          sharedImagesDir: "./public-images",
        },
      },
    );

    expect(shellHttp(config)).toEqual({
      enabled: true,
      preview: false,
      hostname: "127.0.0.1",
      productionDistDir: "./public",
      previewDistDir: "./public-preview",
      sharedImagesDir: "./public-images",
      port: 8080,
    });
  });
});

describe("brain.yaml's retired webserver settings", () => {
  test("plugins.webserver is refused with where its settings went", () => {
    const error = thrownBy(() =>
      resolve(
        brain,
        {},
        {
          bundles: ["web"],
          plugins: { webserver: { productionPort: 9090 } },
        },
      ),
    );

    expect(error.message).toBe(
      'brain.yaml "plugins.webserver" is retired: the runtime hosts HTTP. Set the production port with top-level "port" and serving settings under "http" (enabled, preview, hostname, productionDistDir, previewDistDir, sharedImagesDir); preview shares the production port.',
    );
  });

  for (const list of ["add", "remove"] as const) {
    test(`${list}: [webserver] is refused with where HTTP hosting is chosen`, () => {
      const error = thrownBy(() =>
        resolve(brain, {}, { bundles: ["web"], [list]: ["webserver"] }),
      );

      expect(error.message).toBe(
        `brain.yaml ${list} names "webserver", which is retired: the runtime hosts HTTP. Choose it with "http.enabled" instead.`,
      );
    });
  }

  test("an unknown http setting such as a preview port is refused", () => {
    const error = thrownBy(() =>
      parseInstanceOverrides("brain: test\nhttp:\n  previewPort: 4321\n"),
    );

    expect(error.message).toContain("http");
    expect(error.message).toContain("previewPort");
  });
});
