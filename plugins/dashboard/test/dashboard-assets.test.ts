import { describe, expect, it } from "bun:test";
import { DashboardAssetRegistry } from "../src/dashboard-assets";

describe("DashboardAssetRegistry", () => {
  it("creates deterministic content-addressed URLs and deduplicates widget assets", () => {
    const first = new DashboardAssetRegistry("/ops/");
    const second = new DashboardAssetRegistry("/ops");

    const firstUrls = first.createRenderUrls({
      themeCSS: ":root { --accent: lime; }",
      widgetStyles: [
        ".widget { display: grid; }",
        ".widget { display: grid; }",
      ],
      widgetScripts: [
        "window.widgetReady = true;",
        "window.widgetReady = true;",
      ],
    });
    const secondUrls = second.createRenderUrls({
      themeCSS: ":root { --accent: lime; }",
      widgetStyles: [".widget { display: grid; }"],
      widgetScripts: ["window.widgetReady = true;"],
    });

    expect(firstUrls).toEqual(secondUrls);
    expect(firstUrls.dashboardStyles).toMatch(
      /^\/ops\/assets\/dashboard\.[a-f0-9]{64}\.css$/,
    );
    expect(firstUrls.dashboardScript).toMatch(
      /^\/ops\/assets\/dashboard\.[a-f0-9]{64}\.js$/,
    );
    expect(firstUrls.themeStyles).toMatch(
      /^\/ops\/assets\/theme\.[a-f0-9]{64}\.css$/,
    );
    expect(firstUrls.widgetStyles).toHaveLength(1);
    expect(firstUrls.widgetScripts).toHaveLength(1);
  });

  it("serves immutable typed assets and supports ETag revalidation", async () => {
    const registry = new DashboardAssetRegistry("/dashboard");
    const urls = registry.createRenderUrls({
      widgetStyles: [".widget { color: red; }"],
      widgetScripts: [],
    });
    const path = urls.widgetStyles[0];
    expect(path).toBeDefined();
    if (!path) throw new Error("Expected widget stylesheet URL");
    const route = registry
      .getRoutes()
      .find((candidate) => candidate.path === path);

    expect(route).toBeDefined();
    const response = await route?.handler(new Request(`http://brain${path}`));
    expect(response?.status).toBe(200);
    expect(response?.headers.get("Content-Type")).toBe(
      "text/css; charset=utf-8",
    );
    expect(response?.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(response?.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response?.text()).toBe(".widget { color: red; }");

    const etag = response?.headers.get("ETag") ?? "";
    const notModified = await route?.handler(
      new Request(`http://brain${path}`, {
        headers: { "If-None-Match": etag },
      }),
    );
    expect(notModified?.status).toBe(304);
    expect(await notModified?.text()).toBe("");
  });

  it("keeps previously emitted asset routes available", () => {
    const registry = new DashboardAssetRegistry("/dashboard");
    const first = registry.createRenderUrls({
      widgetStyles: [".first {}"],
      widgetScripts: [],
    });
    registry.createRenderUrls({
      widgetStyles: [".second {}"],
      widgetScripts: [],
    });

    expect(
      registry
        .getRoutes()
        .some((route) => route.path === first.widgetStyles[0]),
    ).toBe(true);
  });
});
