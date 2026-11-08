import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createPluginHarness } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import { WebserverInterface } from "../src/webserver-interface";
import { createSilentLogger } from "@brains/test-utils";

describe("WebserverInterface", () => {
  let harness: ReturnType<typeof createPluginHarness<WebserverInterface>>;
  let plugin: WebserverInterface;

  beforeEach(async () => {
    plugin = new WebserverInterface({
      previewDistDir: "./test-website",
      productionDistDir: "./test-website-production",
      previewPort: 4322,
      productionPort: 8081,
    });

    harness = createPluginHarness<WebserverInterface>({
      logger: createSilentLogger("webserver-test"),
      // A domain is what gives the context a previewUrl; without one the
      // preview surface never registers and the assertions below say nothing.
      domain: "test.example",
    });

    await harness.installPlugin(plugin);
  });

  afterEach(async () => {
    await harness.reset();
  });

  it("should register successfully", () => {
    expect(plugin.id).toBe("webserver");
    expect(plugin.type).toBe("interface");
    expect(plugin.version).toBeDefined();
  });

  it("registers a preview interaction when preview is enabled", () => {
    expect(
      harness
        .getMockShell()
        .listInteractions()
        .map((interaction) => interaction.id),
    ).toContain("preview");
  });

  it("should allow preview to be disabled for core-style usage", async () => {
    const corePlugin = new WebserverInterface({
      enablePreview: false,
      productionDistDir: "./test-website-production-core",
      productionPort: 8083,
    });
    const coreHarness = createPluginHarness<WebserverInterface>({
      logger: createSilentLogger("webserver-core-test"),
      domain: "test.example",
    });

    await coreHarness.installPlugin(corePlugin);

    // The point of enablePreview: false is that no preview surface appears.
    expect(
      coreHarness
        .getMockShell()
        .listInteractions()
        .map((interaction) => interaction.id),
    ).not.toContain("preview");

    await coreHarness.reset();
  });

  it("enables preview by default", async () => {
    // enablePreview defaults to true in the config schema; without an
    // assertion on what that produces, the default is unguarded.
    const defaultPlugin = new WebserverInterface();
    const defaultHarness = createPluginHarness<WebserverInterface>({
      logger: createSilentLogger("webserver-default-test"),
      domain: "test.example",
    });

    await defaultHarness.installPlugin(defaultPlugin);

    expect(
      defaultHarness
        .getMockShell()
        .listInteractions()
        .map((interaction) => interaction.id),
    ).toContain("preview");

    await defaultHarness.reset();
  });
});

describe("WebserverInterface operational health", () => {
  it("answers an anonymous /health/operate with health fields only", async () => {
    const dir = mkdtempSync(join(tmpdir(), "webserver-operate-"));
    mkdirSync(join(dir, "images"), { recursive: true });
    const harness = createPluginHarness<WebserverInterface>({
      logger: createSilentLogger("webserver-operate-test"),
    });
    await harness.installPlugin(
      new WebserverInterface({
        enablePreview: false,
        productionDistDir: join(dir, "production"),
        sharedImagesDir: join(dir, "images"),
        productionPort: 0,
      }),
    );
    const shell = harness.getMockShell();
    const runtimeInfo = await shell.getAppInfo();
    shell.getAppInfo = async (): Promise<typeof runtimeInfo> => ({
      ...runtimeInfo,
      model: "private-brain",
      version: "0.2.0-test",
      uptime: 12,
      entities: 9,
      entityCounts: [{ entityType: "note", count: 9 }],
      embeddings: 9,
      daemons: [
        {
          name: "webserver:webserver",
          pluginId: "webserver",
          status: "running",
          health: {
            status: "healthy",
            message: "Preview: https://preview.private.example",
            lastCheck: new Date("2026-11-07T00:00:00.000Z"),
            details: { previewUrl: "https://preview.private.example" },
          },
        },
      ],
      endpoints: [
        {
          label: "Preview",
          url: "https://preview.private.example",
          pluginId: "webserver",
          priority: 20,
          visibility: "admin",
        },
      ],
      interactions: [
        {
          id: "admin-console",
          label: "Admin console",
          href: "/private-admin",
          kind: "admin",
          pluginId: "studio",
          priority: 30,
          visibility: "admin",
          status: "available",
        },
      ],
    });
    const daemons = shell.getDaemonRegistry();
    await daemons.start("webserver:webserver");
    try {
      const health = await daemons.checkHealth("webserver:webserver");
      const { productionUrl } = z
        .object({ productionUrl: z.string() })
        .parse(health?.details);

      const response = await fetch(`${productionUrl}/health/operate`);

      expect(response.status).toBe(200);
      const body = z
        .object({
          checks: z.array(z.unknown()),
          resources: z.object({ queue: z.unknown(), worker: z.unknown() }),
          app: z.record(z.string(), z.unknown()),
        })
        .parse(await response.json());
      expect(body.app).toEqual({
        version: "0.2.0-test",
        uptime: 12,
        daemons: [
          {
            name: "webserver:webserver",
            pluginId: "webserver",
            status: "running",
            health: {
              status: "healthy",
              lastCheck: "2026-11-07T00:00:00.000Z",
            },
          },
        ],
      });
      expect(body.resources.queue).not.toBeNull();
      expect(body.resources.worker).toBeDefined();
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain("private.example");
      expect(serialized).not.toContain("private-admin");
      expect(serialized).not.toContain("private-brain");
    } finally {
      await daemons.stop("webserver:webserver");
      await harness.reset();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
