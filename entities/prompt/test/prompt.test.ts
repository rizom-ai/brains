import { describe, it, expect } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { createPluginHarness } from "@brains/plugins/test";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import promptPackage, { prompt, promptSlug } from "../src";

const PACKAGE_METADATA = { name: "@brains/prompt", version: "0.0.0-test" };

function promptPlugins(): ReturnType<
  typeof instantiatePluginPackageDefinition
> {
  return instantiatePluginPackageDefinition(
    promptPackage,
    {},
    PACKAGE_METADATA,
  );
}

/** The codec is part of the definition, so it is testable without a plugin. */
function codec(): NonNullable<typeof prompt.markdown> {
  const markdown = prompt.markdown;
  if (!markdown) throw new Error("Prompt definition has no markdown codec");
  return markdown;
}

describe("prompt entity definition", () => {
  it("declares the prompt entity type", () => {
    expect(prompt.type).toBe("prompt");
    expect(prompt.purpose).toBeTruthy();
  });

  it("opts out of embeddings and projection sourcing", () => {
    // Prompts are system configuration, not user content. Both flags
    // default to true, so this must be declared explicitly.
    expect(prompt.config).toEqual({
      embeddable: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
    });
  });
});

describe("promptSlug", () => {
  it("turns a namespaced target into a slug", () => {
    expect(promptSlug("blog:generation")).toBe("blog-generation");
  });

  it("collapses separators and strips non-word characters", () => {
    expect(promptSlug("Link :: Extraction!")).toBe("link-extraction");
  });
});

describe("prompt markdown codec", () => {
  const body = "You are writing blog posts in a distinctive voice.";
  const frontmatter = { title: "Blog Generation", target: "blog:generation" };

  it("decodes frontmatter into metadata and derives the slug", () => {
    expect(codec().decode({ content: body, frontmatter })).toEqual({
      content: body,
      metadata: {
        title: "Blog Generation",
        target: "blog:generation",
        slug: "blog-generation",
      },
    });
  });

  it("rejects markdown missing a required frontmatter field", () => {
    expect(() =>
      codec().decode({ content: body, frontmatter: { title: "No target" } }),
    ).toThrow();
  });

  it("encodes title and target back, dropping the derived slug", () => {
    expect(
      codec().encode({
        content: body,
        metadata: {
          title: "Blog Generation",
          target: "blog:generation",
          slug: "blog-generation",
        },
      }),
    ).toEqual({ content: body, frontmatter });
  });

  it("round-trips without drifting", () => {
    const decoded = codec().decode({ content: body, frontmatter });
    const encoded = codec().encode({
      content: decoded.content,
      metadata: decoded.metadata,
    });
    expect(codec().decode(encoded)).toEqual(decoded);
  });
});

describe("prompt package registration", () => {
  it("registers the prompt entity type with its declared config", async () => {
    const plugin = promptPlugins()[0];
    if (!plugin) throw new Error("Prompt entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("prompt-test"),
    });
    await harness.installPlugin(plugin);

    expect(harness.getEntityService().getEntityTypes()).toContain("prompt");
    expect(
      harness.getEntityService().getEntityTypeConfig("prompt"),
    ).toMatchObject({
      embeddable: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
    });

    harness.reset();
  });

  it("produces exactly one entity plugin", () => {
    expect(promptPlugins()).toHaveLength(1);
  });
});
