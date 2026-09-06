import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { HttpHost } from "../src/http-host";

const directories: string[] = [];
const hosts: HttpHost[] = [];
afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.stop()));
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});
async function directory(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "http-host-"));
  directories.push(dir);
  return dir;
}
function create(
  options: Partial<ConstructorParameters<typeof HttpHost>[0]> = {},
): HttpHost {
  const host = new HttpHost({
    logger: createSilentLogger(),
    config: { port: 0 },
    routes: [],
    sites: [],
    ...options,
  });
  hosts.push(host);
  return host;
}

describe("runtime HTTP host", () => {
  it("does not activate from default placeholder paths or preview settings", async () => {
    const host = create({ config: { port: 0, preview: true } });
    await host.start();
    expect(host.configured).toBe(false);
    expect(host.getStatus().running).toBe(false);
    expect(host.health().status).toBe("healthy");
  });
  it("serves a declared route without any hosting plugin", async () => {
    const dir = await directory();
    const host = create({
      workingDirectory: dir,
      routes: [
        {
          kind: "handler",
          ownerPluginId: "external",
          method: "GET",
          fullPath: "/hello",
          match: "exact",
          sharedHostAdmission: "admit",
          handler: (): Response => new Response("hello"),
        },
      ],
    });
    await host.start();
    expect(host.configured).toBe(true);
    expect(
      await (await fetch(`${host.getStatus().productionUrl}/hello`)).text(),
    ).toBe("hello");
    await host.stop();
    await host.stop();
    expect(host.getStatus().running).toBe(false);
  });
  it("serves site-only output and preview on one socket", async () => {
    const dir = await directory();
    const host = create({
      workingDirectory: dir,
      sites: [
        {
          ownerPluginId: "builder",
          productionOutputDir: "production",
          previewOutputDir: "preview",
          sharedImagesDir: "images",
        },
      ],
    });
    await host.start();
    await Bun.write(join(dir, "production/index.html"), "production");
    await Bun.write(join(dir, "preview/index.html"), "preview");
    const url = host.getStatus().productionUrl;
    expect(await (await fetch(`${url}`)).text()).toBe("production");
    expect(
      await (
        await fetch(`${url}`, { headers: { host: "preview.localhost" } })
      ).text(),
    ).toBe("preview");
    expect(host.getStatus().previewUrl).toBe(url);
  });
  it("activates explicit static output without a builder", async () => {
    const host = create({
      config: { port: 0, productionDistDir: await directory() },
    });
    await host.start();
    expect(host.getStatus().running).toBe(true);
  });
  it("rejects competing builders and divergent HTTP paths before listening", () => {
    const site = {
      ownerPluginId: "builder",
      productionOutputDir: "production",
      previewOutputDir: "preview",
      sharedImagesDir: "images",
    };
    expect(() =>
      create({ sites: [site, { ...site, ownerPluginId: "other" }] }),
    ).toThrow("Multiple static site output owners");
    expect(() =>
      create({ sites: [site], config: { productionDistDir: "different" } }),
    ).toThrow("conflicts with static site output");
    expect(
      create({ sites: [site], config: { productionDistDir: "./production" } })
        .configured,
    ).toBe(true);
  });
  it("rejects dead or unknown settings", () => {
    expect(() =>
      create({ config: { port: 0, ...{ previewPort: 4321 } } }),
    ).toThrow();
    expect(() =>
      create({ config: { port: 0, ...{ apiPort: 8081 } } }),
    ).toThrow();
  });
});
