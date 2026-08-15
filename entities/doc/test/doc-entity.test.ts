import { describe, it, expect } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { createPluginHarness } from "@brains/plugins/test";
import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
} from "@brains/plugins";
import docPackage, { doc, docMetadataSchema } from "../src";

const PACKAGE_METADATA = { name: "@brains/doc", version: "0.0.0-test" };

const frontmatter = {
  title: "Getting Started",
  section: "Start here",
  order: 10,
  sourcePath: "packages/brain-cli/docs/getting-started.md",
  description: "First steps",
  slug: null,
};

const codec = doc.markdown;
if (!codec) throw new Error("Doc entity declares no markdown codec");

async function install(): Promise<ReturnType<typeof createPluginHarness>> {
  bindPluginPackageMetadata(docPackage, PACKAGE_METADATA);
  const plugin = instantiatePluginPackageDefinition(
    docPackage,
    {},
    PACKAGE_METADATA,
  )[0];
  if (!plugin) throw new Error("Doc entity plugin was not created");
  const harness = createPluginHarness({
    logger: createSilentLogger("doc-entity-test"),
  });
  await harness.installPlugin(plugin);
  return harness;
}

describe("doc entity", () => {
  it("decodes frontmatter into metadata, slugifying the title by default", () => {
    expect(codec.decode({ content: "# Getting Started", frontmatter })).toEqual(
      {
        content: "# Getting Started",
        metadata: {
          title: "Getting Started",
          section: "Start here",
          order: 10,
          sourcePath: "packages/brain-cli/docs/getting-started.md",
          description: "First steps",
          slug: "getting-started",
        },
      },
    );
  });

  it("uses an explicit slug when frontmatter pins one", () => {
    const decoded = codec.decode({
      content: "# brain.yaml Reference",
      frontmatter: {
        ...frontmatter,
        title: "brain.yaml Reference",
        slug: "brain-yaml-reference",
      },
    });

    expect(decoded.metadata.slug).toBe("brain-yaml-reference");
  });

  it("round-trips sourcePath, which arrives only in frontmatter", () => {
    // The class-based adapter re-read frontmatter off the stored content when
    // encoding, so sourcePath survived without being metadata. A declarative
    // codec encodes from metadata alone, so it has to be carried there.
    const decoded = codec.decode({ content: "# Getting Started", frontmatter });
    const encoded = codec.encode({
      content: decoded.content,
      metadata: docMetadataSchema.parse(decoded.metadata),
    });

    expect(encoded.frontmatter["sourcePath"]).toBe(
      "packages/brain-cli/docs/getting-started.md",
    );
    expect(encoded.frontmatter["slug"]).toBe("getting-started");
  });

  it("declares the doc entity as a primary projection source", () => {
    expect(doc.config?.projectionSourceRole).toBe("primary");
  });

  it("registers its templates and data source under runtime-scoped ids", async () => {
    const harness = await install();

    expect([...harness.getTemplates().keys()]).toContain(
      "@brains/doc:doc:doc-list",
    );
    // The author declares the local id "entities"; the runtime scopes it.
    expect([...harness.getDataSources().keys()]).toContain(
      "@brains/doc:entities",
    );

    harness.reset();
  });
});
