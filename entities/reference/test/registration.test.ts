import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { referencePlugins } from "./reference-fixture";

async function installed(): Promise<ReturnType<typeof createPluginHarness>> {
  const harness = createPluginHarness({});
  for (const plugin of referencePlugins()) await harness.installPlugin(plugin);
  return harness;
}

describe("the references' registered surface", () => {
  it("registers the reference type, bodiless and created from an address", async () => {
    const harness = await installed();
    const registry = harness.getEntityRegistry();

    const adapter = registry.getAdapter("reference");

    expect(adapter.purpose).toBe(
      "A pointer to an entity published on another brain: its title, summary, author and address, never its content.",
    );
    expect(adapter.getBodyTemplate()).toBe("");
    expect(registry.getCreateInterceptor("reference")).toBeDefined();
  });

  it("registers the capture job and exposes no tools", async () => {
    const harness = createPluginHarness({});
    const capabilities = await Promise.all(
      referencePlugins().map((plugin) => harness.installPlugin(plugin)),
    );

    expect(capabilities.flatMap(({ tools }) => tools)).toEqual([]);
    expect(
      harness
        .getMockShell()
        .getJobQueueService()
        .getRegisteredTypes()
        .filter((type) => type.includes("reference")),
    ).toEqual(["reference:capture"]);
  });

  it("stores a reference as frontmatter alone", async () => {
    const harness = await installed();
    const adapter = harness.getEntityRegistry().getAdapter("reference");

    const markdown = adapter.toMarkdown({
      id: "author-example-essay",
      entityType: "reference",
      content: "",
      created: "2026-11-25T00:00:00.000Z",
      updated: "2026-11-25T00:00:00.000Z",
      visibility: "public",
      contentHash: "hash",
      metadata: {
        status: "published",
        title: "An essay",
        author: "Ada Author",
        authorSite: "author.example",
        url: "https://author.example/essays/essay",
        publishedAt: "2026-05-02T09:00:00.000Z",
        sourceState: "active",
        sourceUri: "at://did:plc:author/ai.rizom.brain.post/essay",
        sourceEntityType: "post",
        sourceEntityId: "essay",
      },
    });

    expect(markdown).toBe(
      [
        "---",
        "status: published",
        "title: An essay",
        "author: Ada Author",
        "authorSite: author.example",
        "url: 'https://author.example/essays/essay'",
        "publishedAt: '2026-05-02T09:00:00.000Z'",
        "sourceState: active",
        "sourceUri: 'at://did:plc:author/ai.rizom.brain.post/essay'",
        "sourceEntityType: post",
        "sourceEntityId: essay",
        "---",
        "",
        "",
      ].join("\n"),
    );
    expect(adapter.fromMarkdown(markdown).metadata).toMatchObject({
      status: "published",
      sourceState: "active",
    });
  });
});
