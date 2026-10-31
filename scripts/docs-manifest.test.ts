import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseDocsManifest } from "./docs-manifest";

const repositoryRoot = join(import.meta.dir, "..");

const fixture = `docs:
  - id: index # the landing page
    title: Documentation
    section: Start here
    order: 0
    source: docs/README.md

  - id: brain-yaml-reference
    title: "brain.yaml Reference"
    section: 'Start here'
    order: 20
    source: packages/brain-cli/docs/brain-yaml-reference.md

guides:
  - id: writer
    source: docs/guides/writer.md
`;

describe("parseDocsManifest", () => {
  it("parses entries with comments and quoted values", () => {
    expect(parseDocsManifest(fixture).docs).toEqual([
      {
        id: "index",
        title: "Documentation",
        section: "Start here",
        order: 0,
        source: "docs/README.md",
      },
      {
        id: "brain-yaml-reference",
        title: "brain.yaml Reference",
        section: "Start here",
        order: 20,
        source: "packages/brain-cli/docs/brain-yaml-reference.md",
      },
    ]);
  });

  it("parses guides by id and source; their frontmatter carries the rest", () => {
    expect(parseDocsManifest(fixture).guides).toEqual([
      { id: "writer", source: "docs/guides/writer.md" },
    ]);
  });

  it("parses every entry of the real manifest in order", () => {
    const content = readFileSync(
      join(repositoryRoot, "docs", "docs-manifest.yaml"),
      "utf8",
    );
    const declaredIds = Array.from(
      content.matchAll(/^ {2}- id: (\S+)$/gm),
      (match) => match[1] ?? "",
    );

    const { docs, guides } = parseDocsManifest(content);

    expect(declaredIds.length).toBeGreaterThan(0);
    expect([...docs, ...guides].map((entry) => entry.id)).toEqual(declaredIds);
    expect(guides.map((entry) => entry.id)).toContain("writer");
    for (const entry of docs) {
      expect(entry.title).not.toBe("");
      expect(entry.section).not.toBe("");
      expect(Number.isInteger(entry.order)).toBe(true);
    }
    for (const entry of [...docs, ...guides]) {
      expect(existsSync(join(repositoryRoot, entry.source))).toBe(true);
    }
  });

  it("rejects an unknown field", () => {
    expect(() =>
      parseDocsManifest(fixture.replace("order: 20", "rank: 20")),
    ).toThrow("docs.1");
  });

  it("rejects a non-integer order", () => {
    expect(() =>
      parseDocsManifest(fixture.replace("order: 20", "order: 2.5")),
    ).toThrow("docs.1.order");
  });

  it("rejects an entry missing a field", () => {
    expect(() =>
      parseDocsManifest(fixture.replace("    section: 'Start here'\n", "")),
    ).toThrow("docs.1.section");
  });

  it("rejects a guide that restates frontmatter in the manifest", () => {
    expect(() =>
      parseDocsManifest(
        fixture.replace(
          "    source: docs/guides/writer.md",
          "    source: docs/guides/writer.md\n    order: 10",
        ),
      ),
    ).toThrow("guides.0");
  });

  it("rejects a guide without a source", () => {
    expect(() =>
      parseDocsManifest(
        fixture.replace("    source: docs/guides/writer.md\n", ""),
      ),
    ).toThrow("guides.0.source");
  });
});
