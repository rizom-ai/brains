import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const script = join(import.meta.dir, "sync-docs-content.ts");

const manifest = `docs:
  - id: content-management
    title: Content Management
    section: Content and entities
    order: 50
    source: docs/content-management.md

guides:
  - id: writer
    source: docs/guides/writer.md

  - id: team
    source: docs/guides/team.md
`;

const contentManagement = `# Content Management

Writers start from [the writer guide](guides/writer.md).
`;

const writer = `---
title: Moving in as a writer
slug: writer
order: 10
persona: The writer
for: You have years of essays.
recipe: professional
material:
  - from: Drafts and fragments
    where: Google Docs
    becomes: note
    how: Download as Markdown
---

## Bring your drafts in

Working with others? Read [the team guide](./team.md#start).

The importer lives in [the script](../../scripts/import.ts).

Exact steps: [Content management](../content-management.md).
`;

const team = `---
title: Moving in as a team
slug: team
order: 40
persona: The team
for: You share a drive.
material: []
---

## Start

Text.
`;

const expectedWriter = `---
title: Moving in as a writer
slug: writer
order: 10
persona: The writer
for: You have years of essays.
recipe: professional
material:
  - from: Drafts and fragments
    where: Google Docs
    becomes: note
    how: Download as Markdown
---

## Bring your drafts in

Working with others? Read [the team guide](/guides/team#start).

The importer lives in [the script](https://github.com/rizom-ai/brains/blob/main/scripts/import.ts).

Exact steps: [Content management](/docs/content-management).
`;

interface Run {
  exitCode: number;
  output: string;
}

describe("sync-docs-content guides", () => {
  let root: string;

  const write = (path: string, content: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  const read = (path: string): string => readFileSync(join(root, path), "utf8");
  const run = (...args: string[]): Run => {
    const result = Bun.spawnSync(["bun", script, "--out", "content", ...args], {
      cwd: root,
    });
    return {
      exitCode: result.exitCode,
      output: `${result.stdout.toString()}${result.stderr.toString()}`,
    };
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "sync-docs-content-"));
    write("docs/docs-manifest.yaml", manifest);
    write("docs/content-management.md", contentManagement);
    write("docs/guides/writer.md", writer);
    write("docs/guides/team.md", team);
    write("scripts/import.ts", "export {};\n");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("writes each guide with its frontmatter, slug set to its id", () => {
    write("docs/guides/team.md", team.replace("slug: team", "slug: teams"));

    const result = run();

    expect(result.exitCode).toBe(0);
    expect(read("content/guide/team.md")).toContain("\nslug: team\n");
    expect(read("content/guide/team.md")).not.toContain("recipe");
  });

  it("rewrites guide links to guide and doc pages and other repo paths to GitHub", () => {
    expect(run().exitCode).toBe(0);

    expect(read("content/guide/writer.md")).toBe(expectedWriter);
  });

  it("rewrites doc links to guide sources as guide pages", () => {
    expect(run().exitCode).toBe(0);

    expect(read("content/doc/content-management.md")).toContain(
      "[the writer guide](/guides/writer)",
    );
  });

  it("removes stale guides", () => {
    write("content/guide/retired.md", "# Retired\n");

    expect(run().exitCode).toBe(0);

    expect(existsSync(join(root, "content/guide/retired.md"))).toBe(false);
  });

  it("fails on a guide source whose frontmatter is not a guide", () => {
    write("docs/guides/team.md", team.replace("for: You share a drive.\n", ""));

    const result = run();

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("docs/guides/team.md");
    expect(existsSync(join(root, "content/guide/team.md"))).toBe(false);
  });

  describe("--subset", () => {
    beforeEach(() => {
      expect(run().exitCode).toBe(0);
      rmSync(join(root, "content/doc/content-management.md"));
    });

    it("rewrites only the docs and guides the folder holds", () => {
      write("content/guide/writer.md", "# Edited\n");

      expect(run("--subset").exitCode).toBe(0);

      expect(read("content/guide/writer.md")).toBe(expectedWriter);
      expect(existsSync(join(root, "content/doc/content-management.md"))).toBe(
        false,
      );
    });

    it("checks the held files without asking for the rest", () => {
      const result = run("--subset", "--check");

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("0 docs, 2 guides");
    });

    it("reports a held file that is out of date", () => {
      write("content/guide/writer.md", "# Edited\n");

      const result = run("--subset", "--check");

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain("out of date content/guide/writer.md");
    });

    it("reports a held file the manifest does not name", () => {
      write("content/guide/retired.md", "# Retired\n");

      const result = run("--subset", "--check");

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain("stale content/guide/retired.md");
    });
  });

  describe("--check", () => {
    beforeEach(() => {
      expect(run().exitCode).toBe(0);
    });

    it("passes when docs and guides are in sync", () => {
      const result = run("--check");

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("1 docs, 2 guides");
    });

    it("reports a guide that is out of date", () => {
      write("content/guide/writer.md", "# Edited\n");

      const result = run("--check");

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain("out of date content/guide/writer.md");
    });

    it("reports a missing guide", () => {
      rmSync(join(root, "content/guide/team.md"));

      const result = run("--check");

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain("missing content/guide/team.md");
    });

    it("reports a stale guide without removing it", () => {
      write("content/guide/retired.md", "# Retired\n");

      const result = run("--check");

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain("stale content/guide/retired.md");
      expect(existsSync(join(root, "content/guide/retired.md"))).toBe(true);
    });

    it("still checks docs", () => {
      write("content/doc/content-management.md", "# Edited\n");

      const result = run("--check");

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain(
        "out of date content/doc/content-management.md",
      );
    });
  });
});
