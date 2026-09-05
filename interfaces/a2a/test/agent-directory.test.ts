import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { ContentVisibility, WebRouteDefinition } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import {
  A2A_PLUGIN_ID,
  installA2A,
  installWebserverPlugin as installWebserver,
  type InstalledA2A,
} from "./helpers/install";

describe("A2A public agent directory", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  function installWebserverPlugin(): void {
    installWebserver(harness);
  }

  beforeEach(() => {
    harness = createPluginHarness({
      logger: createSilentLogger("a2a-directory"),
    });
  });

  afterEach(async () => {
    await harness.getMockShell().getDaemonRegistry().stopPlugin(A2A_PLUGIN_ID);
  });

  async function seedAgent(params: {
    id: string;
    name: string;
    status: "discovered" | "approved" | "archived";
    visibility?: ContentVisibility;
  }): Promise<void> {
    await harness
      .getMockShell()
      .getEntityService()
      .createEntity({
        entity: {
          id: params.id,
          entityType: "agent",
          content: "",
          visibility: params.visibility ?? "public",
          metadata: {
            name: params.name,
            url: `https://${params.id}/a2a`,
            status: params.status,
            slug: params.id,
          },
        },
      });
  }

  function directoryRoute(a2a: InstalledA2A): WebRouteDefinition {
    const route = a2a
      .routes()
      .find(
        (candidate) =>
          candidate.path === "/.well-known/agent-directory.json" &&
          candidate.method === "GET",
      );
    expect(route).toBeDefined();
    if (!route) {
      throw new Error("Expected agent directory GET route");
    }
    return route;
  }

  it("serves approved public agents as minimal name/url pointers, sorted by name", async () => {
    // Seeded out of name order to prove the directory sorts.
    await seedAgent({ id: "lumen.brain", name: "Lumen", status: "approved" });
    await seedAgent({ id: "kai.brain", name: "Kai", status: "approved" });
    await seedAgent({ id: "noor.brain", name: "Noor", status: "discovered" });
    await seedAgent({ id: "old.brain", name: "Old", status: "archived" });
    await seedAgent({
      id: "quiet.brain",
      name: "Quiet",
      status: "approved",
      visibility: "restricted",
    });

    installWebserverPlugin();
    const a2a = await installA2A(harness, { port: 0 });

    const response = await directoryRoute(a2a).handler(
      new Request("http://brain/.well-known/agent-directory.json"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await response.json()).toEqual({
      agents: [
        { name: "Kai", url: "https://kai.brain/a2a" },
        { name: "Lumen", url: "https://lumen.brain/a2a" },
      ],
    });
  });

  it("serves an empty directory when no agents are saved", async () => {
    installWebserverPlugin();
    const a2a = await installA2A(harness, { port: 0 });

    const response = await directoryRoute(a2a).handler(
      new Request("http://brain/.well-known/agent-directory.json"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ agents: [] });
  });

  it("registers the directory as a public GET web route", async () => {
    installWebserverPlugin();
    const a2a = await installA2A(harness, { port: 0 });

    const route = directoryRoute(a2a);
    expect(route.public).toBe(true);
    expect(route.method).toBe("GET");
  });
});
