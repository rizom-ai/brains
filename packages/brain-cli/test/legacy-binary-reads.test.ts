import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import type { App } from "@brains/app";
import type { Shell } from "@brains/core";
import { stageImageEntity } from "@brains/image";
import type { ToolContext } from "@brains/mcp-service";
import { isRecord } from "@brains/utils/is-record";
import { CallbackProgressReporter } from "@brains/utils/progress";
import { createFullPresetApp } from "./helpers/full-preset-app";
import { GIF, PNG, dataUrl } from "./helpers/binary-asset-fixture";

/**
 * The reads a brain makes of its images once they are durable assets: a
 * production site build, and the tools and resources an operator reads
 * through. None of them may ask the entity service to turn a reference back
 * into a data URL; that legacy form is what the bridge removal retires, and
 * it may go only once nothing first-party still asks for it.
 */

const apps: App[] = [];
const directories: string[] = [];
afterEach(async () => {
  for (const app of apps.splice(0).reverse()) await app.stop();
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

/**
 * Under the package, not the system temp dir: the site's stylesheet imports
 * Tailwind, which resolves from the build's own directory.
 */
async function brainDirectory(): Promise<string> {
  const cache = join(import.meta.dir, "..", ".cache");
  await mkdir(cache, { recursive: true });
  const directory = await mkdtemp(join(cache, "legacy-binary-reads-"));
  directories.push(directory);
  return directory;
}

const markdown = (
  frontmatter: Record<string, string | number>,
  body: string,
): string =>
  [
    "---",
    ...Object.entries(frontmatter).map(
      ([key, value]) => `${key}: ${JSON.stringify(value)}`,
    ),
    "---",
    "",
    body,
    "",
  ].join("\n");

const published = {
  status: "published",
  publishedAt: "2025-11-20T00:00:00.000Z",
};

/** Asset-backed images, and the published entries that show them. */
async function seed(shell: Shell): Promise<void> {
  const entityService = shell.getEntityService();
  const images: Array<[string, Buffer]> = [
    ["post-cover", PNG],
    ["inline-figure", GIF],
    ["post-og", PNG],
    ["series-cover", GIF],
    ["deck-cover", PNG],
    ["project-cover", GIF],
  ];
  for (const [id, bytes] of images) {
    const staged = await stageImageEntity(
      entityService,
      { bytes },
      { title: id },
    );
    await entityService.createEntity({
      entity: { ...staged.entity, id },
      stagedAsset: staged.stagedAsset,
    });
  }
  const entries: Array<[string, string, string]> = [
    [
      "post",
      "with-images",
      markdown(
        {
          title: "With images",
          slug: "with-images",
          ...published,
          excerpt: "Images",
          author: "Alex",
          coverImageId: "post-cover",
          ogImageId: "post-og",
          seriesName: "Imaged Series",
          seriesIndex: 1,
        },
        "Body ![A figure](entity://image/inline-figure)",
      ),
    ],
    [
      "series",
      "imaged-series",
      markdown(
        {
          title: "Imaged Series",
          slug: "imaged-series",
          coverImageId: "series-cover",
        },
        "# Imaged Series\n\n## Description\nA series.",
      ),
    ],
    [
      "deck",
      "imaged-deck",
      markdown(
        {
          title: "Imaged deck",
          slug: "imaged-deck",
          description: "Deck",
          author: "Alex",
          ...published,
          coverImageId: "deck-cover",
        },
        "# Slide\n\n![A figure](entity://image/inline-figure)\n\n---\n\n# Two",
      ),
    ],
    [
      "project",
      "imaged-project",
      markdown(
        {
          title: "Imaged project",
          slug: "imaged-project",
          description: "Project",
          year: 2025,
          ...published,
          coverImageId: "project-cover",
        },
        "# Project\n\n![A figure](entity://image/inline-figure)",
      ),
    ],
  ];
  for (const [entityType, id, content] of entries) {
    await entityService.createEntityFromMarkdown({
      input: { entityType, id, markdown: content },
    });
  }
}

async function bootBrain(): Promise<{ shell: Shell; directory: string }> {
  const directory = await brainDirectory();
  const app = createFullPresetApp(directory);
  apps.push(app);
  await app.migrate();
  await app.initialize(
    { mode: "startup-check" },
    { migrationsCompleted: true },
  );
  const shell = app.getShell();
  await seed(shell);
  return { shell, directory };
}

const operator: ToolContext = {
  interfaceType: "mcp",
  actor: { kind: "user", userId: "operator" },
  userPermissionLevel: "admin",
};

async function callTool(
  shell: Shell,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const registered = shell
    .getMCPService()
    .listTools()
    .find(({ tool }) => tool.name === name);
  if (!registered) throw new Error(`No tool ${name}`);
  return registered.tool.handler(input, operator);
}

async function readResource(shell: Shell, uri: string): Promise<string> {
  const server = shell.getMCPService().createMcpServer("admin");
  const client = new Client({ name: "legacy-binary-reads", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const { contents } = await client.readResource({ uri });
    const [first] = contents;
    if (!first || !("text" in first)) throw new Error(`No text at ${uri}`);
    return first.text;
  } finally {
    await client.close();
    await server.close();
  }
}

/** What `system_status` reports of legacy reads, the soak's own signal. */
async function legacyReads(shell: Shell): Promise<unknown[]> {
  return (await shell.getAppInfo()).legacyBinaryContent;
}

describe("a brain whose images are durable assets", () => {
  it("builds its production site without materializing a data URL", async () => {
    const { shell, directory } = await bootBrain();
    const build = shell
      .getJobQueueService()
      .getHandler("site-builder:site-build");
    if (!build) throw new Error("The brain registers no site build");
    const outputDir = join(directory, "site-production");
    const progress = CallbackProgressReporter.from(async () => {});
    if (!progress) throw new Error("No progress reporter");

    const result = await build.process(
      { environment: "production", outputDir },
      "production-build",
      progress,
      new AbortController().signal,
    );

    expect(result).toMatchObject({ success: true });
    expect(await legacyReads(shell)).toEqual([]);
    // The deck still opens on its cover, encoded from the asset's bytes.
    expect(
      await readFile(join(outputDir, "decks/imaged-deck/index.html"), "utf8"),
    ).toContain(`data-background-image="${dataUrl("png", PNG)}"`);
  }, 120_000);

  it("answers the operator's reads without materializing a data URL", async () => {
    const { shell } = await bootBrain();

    await callTool(shell, "system_list", { entityType: "image" });
    await callTool(shell, "system_get", {
      entityType: "image",
      id: "deck-cover",
    });
    await callTool(shell, "system_search", {
      query: "cover",
      scope: { kind: "type", entityType: "image" },
    });
    await callTool(shell, "system_search", {
      query: "cover",
      scope: { kind: "all" },
    });
    await readResource(shell, "entity://image");
    const detail = await readResource(shell, "entity://image/deck-cover");
    const proposal = await callTool(shell, "system_update", {
      entityType: "image",
      id: "deck-cover",
      operation: { fields: { title: "Deck cover" } },
    });
    const confirmed = isRecord(proposal) ? proposal["args"] : undefined;
    if (!isRecord(confirmed))
      throw new Error("The update asked for no confirmation");
    const updated = await callTool(shell, "system_update", confirmed);

    expect(await legacyReads(shell)).toEqual([]);
    // The resource still reads an image as the data URL it always returned.
    expect(detail).toBe(dataUrl("png", PNG));
    expect(updated).toMatchObject({ success: true });
    expect(JSON.stringify(updated)).not.toContain("base64");
  }, 120_000);
});
