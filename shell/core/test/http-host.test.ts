import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { migrateConversations } from "@brains/conversation-service/migrate";
import { migrateEntities } from "@brains/entity-service/migrate";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import type {
  Plugin,
  PluginCapabilities,
  WebRouteDefinition,
} from "@brains/plugins";
import type { StaticSiteOutput } from "@brains/plugins/internal/http-host";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import type { BootMode } from "../src/initialization/shellBootloader";
import type { ShellRuntimeOptions } from "../src/runtime-process-role";
import { Shell, type ShellDependencies } from "../src/shell";
import type { ShellConfigInput } from "../src/config";
import { createTestShellConfig } from "./helpers/test-config";

const dependencies: Partial<ShellDependencies> = {
  logger: createSilentLogger("http-host-test"),
  embeddingService: {
    dimensions: 1536,
    generateEmbedding: async () => ({
      embedding: new Float32Array(1536).fill(0.1),
      usage: { tokens: 1 },
    }),
    generateEmbeddings: async (texts: string[]) => ({
      embeddings: texts.map(() => new Float32Array(1536).fill(0.1)),
      usage: { tokens: texts.length },
    }),
  },
};

function freePort(): number {
  const listener = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data() {} },
  });
  const { port } = listener;
  listener.stop(true);
  return port;
}

/** Whether something accepts connections on the port. */
async function isListening(port: number): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${port}/health/live`, {
      signal: AbortSignal.timeout(1_000),
    });
    return true;
  } catch {
    // A refused connection is the answer, not a failure.
    return false;
  }
}

/** The message a boot fails with; empty when it does not fail. */
async function bootError(shell: Shell): Promise<string> {
  try {
    await shell.initialize();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function writeFile(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function routePlugin(path: string): Plugin {
  return {
    id: "route-owner",
    packageName: "@test/route-owner",
    type: "service",
    version: "1.0.0",
    register: async (): Promise<PluginCapabilities> => ({
      tools: [],
      resources: [],
    }),
    getWebRoutes: (): WebRouteDefinition[] => [
      {
        path,
        public: true,
        handler: (): Response => new Response("from the route"),
      },
    ],
  };
}

function siteBuilderPlugin(id: string, output: StaticSiteOutput): Plugin {
  return {
    id,
    packageName: `@test/${id}`,
    type: "service",
    version: "1.0.0",
    register: async (): Promise<PluginCapabilities> => ({
      tools: [],
      resources: [],
    }),
    getStaticSiteOutput: (): StaticSiteOutput => output,
  };
}

describe("the shell's HTTP host", () => {
  let testDirectory: { dir: string; cleanup: () => Promise<void> };
  let shell: Shell | undefined;
  let port: number;

  beforeEach(async () => {
    testDirectory = await createTestDirectory();
    port = freePort();
    await Promise.all([
      migrateEntities({ url: `file:${testDirectory.dir}/test.db` }),
      migrateJobQueue({ url: `file:${testDirectory.dir}/test-jobs.db` }),
      migrateConversations({ url: `file:${testDirectory.dir}/test-conv.db` }),
      migrateRuntimeState({
        url: `file:${testDirectory.dir}/test-runtime-state.db`,
      }),
    ]);
  });

  afterEach(async () => {
    await shell?.shutdown();
    shell = undefined;
    await testDirectory.cleanup();
  });

  function dist(name: string): string {
    return join(testDirectory.dir, "dist", name);
  }

  function config(
    http: NonNullable<ShellConfigInput["http"]>,
    overrides: Partial<ShellConfigInput> = {},
  ): ShellConfigInput {
    return createTestShellConfig(testDirectory.dir, {
      http: {
        port,
        productionDistDir: dist("site-production"),
        previewDistDir: dist("site-preview"),
        sharedImagesDir: dist("images"),
        ...http,
      },
      ...overrides,
    });
  }

  it("serves nothing and reports no HTTP surface unless enabled", async () => {
    shell = Shell.createFresh(
      config({ enabled: false }, { plugins: [routePlugin("/hello")] }),
      dependencies,
    );
    await shell.initialize();

    expect(shell.servesHttp()).toBe(false);
    expect(await isListening(port)).toBe(false);
    expect(
      (await shell.getAppInfo()).daemons.map(({ name }) => name),
    ).not.toContain("webserver:webserver");
  });

  it("listens on its configured port and serves the finalized routes", async () => {
    shell = Shell.createFresh(
      config({ enabled: true }, { plugins: [routePlugin("/hello")] }),
      dependencies,
    );
    await shell.initialize();

    expect(shell.servesHttp()).toBe(true);
    const response = await fetch(`http://127.0.0.1:${port}/hello`);
    expect(await response.text()).toBe("from the route");
    expect((await fetch(`http://127.0.0.1:${port}/health/live`)).status).toBe(
      200,
    );
  });

  it("reports its daemon as the webserver, right after the shell's own", async () => {
    shell = Shell.createFresh(config({ enabled: true }), dependencies);
    await shell.initialize();

    const daemons = (await shell.getAppInfo()).daemons;
    const names = daemons.map(({ name }) => name);
    const host = daemons.find(({ name }) => name === "webserver:webserver");
    expect(host).toMatchObject({
      pluginId: "webserver",
      status: "running",
      health: {
        status: "healthy",
        message: `Production: http://localhost:${port}, Preview: http://localhost:${port}`,
        details: {
          preview: true,
          production: true,
          previewUrl: `http://localhost:${port}`,
          productionUrl: `http://localhost:${port}`,
        },
      },
    });
    const shellDaemons = names.filter((name) => name.startsWith("shell:"));
    expect(names.slice(0, shellDaemons.length + 1)).toEqual([
      ...shellDaemons,
      "webserver:webserver",
    ]);
  });

  it("names the public site and preview URLs in its health when the brain has a domain", async () => {
    shell = Shell.createFresh(
      config({ enabled: true }, { siteBaseUrl: "brain.example.test" }),
      dependencies,
    );
    await shell.initialize();

    const host = (await shell.getAppInfo()).daemons.find(
      ({ name }) => name === "webserver:webserver",
    );
    expect(host?.health?.message).toBe(
      "Production: https://brain.example.test, Preview: https://preview.brain.example.test",
    );
  });

  it("advertises the site and its preview as the webserver", async () => {
    shell = Shell.createFresh(
      config({ enabled: true }, { siteBaseUrl: "brain.example.test" }),
      dependencies,
    );
    await shell.initialize({ mode: "register-only" });

    expect(
      shell.listEndpoints().filter(({ pluginId }) => pluginId === "webserver"),
    ).toEqual([
      {
        pluginId: "webserver",
        label: "Site",
        url: "https://brain.example.test",
        priority: 10,
        visibility: "public",
      },
      {
        pluginId: "webserver",
        label: "Preview",
        url: "https://preview.brain.example.test",
        priority: 20,
        visibility: "admin",
      },
    ]);
    expect(
      shell
        .listInteractions()
        .filter(({ pluginId }) => pluginId === "webserver")
        .map(({ id, href, kind }) => ({ id, href, kind })),
    ).toEqual([
      { id: "site", href: "https://brain.example.test", kind: "human" },
      {
        id: "preview",
        href: "https://preview.brain.example.test",
        kind: "admin",
      },
    ]);
  });

  it("advertises no preview when preview is off, and nothing without a domain", async () => {
    shell = Shell.createFresh(
      config(
        { enabled: true, preview: false },
        { siteBaseUrl: "brain.example.test" },
      ),
      dependencies,
    );
    await shell.initialize({ mode: "register-only" });
    expect(
      shell
        .listEndpoints()
        .filter(({ pluginId }) => pluginId === "webserver")
        .map(({ label }) => label),
    ).toEqual(["Site"]);
    await shell.shutdown();

    shell = Shell.createFresh(config({ enabled: true }), dependencies);
    await shell.initialize({ mode: "register-only" });
    expect(
      shell.listEndpoints().filter(({ pluginId }) => pluginId === "webserver"),
    ).toEqual([]);
  });

  const nonServingBoots: Array<{
    name: string;
    mode?: BootMode;
    runtimeOptions?: ShellRuntimeOptions;
    servesHttp: boolean;
  }> = [
    { name: "register-only", mode: "register-only", servesHttp: true },
    { name: "startup-check", mode: "startup-check", servesHttp: true },
    {
      name: "worker",
      runtimeOptions: { processRole: "worker" },
      servesHttp: false,
    },
  ];
  for (const boot of nonServingBoots) {
    it(`opens no listener and creates no placeholder in a ${boot.name} boot`, async () => {
      shell = Shell.createFresh(
        config({ enabled: true }, { plugins: [routePlugin("/hello")] }),
        dependencies,
        boot.runtimeOptions,
      );
      await shell.initialize(boot.mode ? { mode: boot.mode } : undefined);

      expect(shell.servesHttp()).toBe(boot.servesHttp);
      expect(await isListening(port)).toBe(false);
      expect(existsSync(dist("site-production"))).toBe(false);
      expect(existsSync(dist("site-preview"))).toBe(false);
    });
  }

  it("serves a placeholder page from fresh production and preview directories", async () => {
    shell = Shell.createFresh(config({ enabled: true }), dependencies);
    await shell.initialize();

    expect(existsSync(join(dist("site-production"), "index.html"))).toBe(true);
    expect(existsSync(join(dist("site-preview"), "index.html"))).toBe(true);
    const page = await fetch(`http://127.0.0.1:${port}/index.html`);
    expect(page.status).toBe(200);
  });

  it("creates no preview directory when preview is off", async () => {
    shell = Shell.createFresh(
      config({ enabled: true, preview: false }),
      dependencies,
    );
    await shell.initialize();

    expect(existsSync(dist("site-production"))).toBe(true);
    expect(existsSync(dist("site-preview"))).toBe(false);
  });

  it("serves the site where the site builder writes it", async () => {
    const output: StaticSiteOutput = {
      productionOutputDir: join(testDirectory.dir, "built", "production"),
      previewOutputDir: join(testDirectory.dir, "built", "preview"),
      sharedImagesDir: join(testDirectory.dir, "built", "images"),
    };
    writeFile(join(output.productionOutputDir, "about/index.html"), "prod");
    writeFile(join(output.previewOutputDir, "about/index.html"), "preview");
    writeFile(join(output.sharedImagesDir, "pic.webp"), "image");
    shell = Shell.createFresh(
      createTestShellConfig(testDirectory.dir, {
        http: { enabled: true, port },
        plugins: [siteBuilderPlugin("site-builder", output)],
      }),
      dependencies,
    );
    await shell.initialize();

    const base = `http://127.0.0.1:${port}`;
    expect(await (await fetch(`${base}/about`)).text()).toBe("prod");
    expect(
      await (
        await fetch(`${base}/about`, { headers: { host: "preview.localhost" } })
      ).text(),
    ).toBe("preview");
    expect(await (await fetch(`${base}/images/pic.webp`)).text()).toBe("image");
  });

  it("accepts explicit directories that name the builder's own", async () => {
    const output: StaticSiteOutput = {
      productionOutputDir: dist("site-production"),
      previewOutputDir: dist("site-preview"),
      sharedImagesDir: dist("images"),
    };
    shell = Shell.createFresh(
      config(
        { enabled: true },
        {
          plugins: [siteBuilderPlugin("site-builder", output)],
        },
      ),
      dependencies,
    );
    await shell.initialize();

    expect(await isListening(port)).toBe(true);
  });

  it("refuses an explicit directory the site builder does not write, before listening", async () => {
    shell = Shell.createFresh(
      config(
        { enabled: true },
        {
          plugins: [
            siteBuilderPlugin("site-builder", {
              productionOutputDir: join(testDirectory.dir, "elsewhere"),
              previewOutputDir: dist("site-preview"),
              sharedImagesDir: dist("images"),
            }),
          ],
        },
      ),
      dependencies,
    );

    expect(await bootError(shell)).toContain(
      `http.productionDistDir "${dist("site-production")}" is not where "site-builder" writes the production site ("${join(testDirectory.dir, "elsewhere")}")`,
    );
    expect(await isListening(port)).toBe(false);
  });

  it("refuses two plugins that each write the site", async () => {
    const output: StaticSiteOutput = {
      productionOutputDir: dist("site-production"),
      previewOutputDir: dist("site-preview"),
      sharedImagesDir: dist("images"),
    };
    shell = Shell.createFresh(
      config(
        { enabled: true },
        {
          plugins: [
            siteBuilderPlugin("first-builder", output),
            siteBuilderPlugin("second-builder", output),
          ],
        },
      ),
      dependencies,
    );

    expect(await bootError(shell)).toContain(
      'Two plugins write the site the HTTP host serves: "first-builder" and "second-builder"',
    );
  });

  it("releases its port when the shell shuts down", async () => {
    shell = Shell.createFresh(config({ enabled: true }), dependencies);
    await shell.initialize();
    expect(await isListening(port)).toBe(true);

    await shell.shutdown();
    shell = undefined;

    expect(await isListening(port)).toBe(false);
  });

  it("names a port another process holds", async () => {
    const holder = Bun.serve({ port, fetch: () => new Response("held") });
    try {
      shell = Shell.createFresh(config({ enabled: true }), dependencies);
      expect(await bootError(shell)).toContain(
        `Port ${port} is already in use. Another brain may be running — stop it first or configure a different port.`,
      );
    } finally {
      await holder.stop(true);
    }
  });
});
