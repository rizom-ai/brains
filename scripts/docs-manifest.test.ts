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
`;

describe("parseDocsManifest", () => {
  it("parses entries with comments and quoted values", () => {
    expect(parseDocsManifest(fixture)).toEqual([
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

  it("parses every entry of the real manifest in order", () => {
    const content = readFileSync(
      join(repositoryRoot, "docs", "docs-manifest.yaml"),
      "utf8",
    );
    const declaredIds = Array.from(
      content.matchAll(/^ {2}- id: (\S+)$/gm),
      (match) => match[1] ?? "",
    );

    const entries = parseDocsManifest(content);

    expect(declaredIds.length).toBeGreaterThan(0);
    expect(entries.map((entry) => entry.id)).toEqual(declaredIds);
    for (const entry of entries) {
      expect(entry.title).not.toBe("");
      expect(entry.section).not.toBe("");
      expect(Number.isInteger(entry.order)).toBe(true);
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
});
