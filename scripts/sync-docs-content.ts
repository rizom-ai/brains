#!/usr/bin/env bun

import { guideFrontmatterSchema } from "@brains/guide/frontmatter";
import { getErrorMessage } from "@brains/utils/error";
import {
  generateMarkdown,
  readMarkdownFrontmatter,
} from "@brains/utils/markdown-frontmatter";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  type DocsManifest,
  type DocsManifestEntry,
  type GuideManifestEntry,
  parseDocsManifest,
} from "./docs-manifest";

interface Args {
  outDir?: string;
  check: boolean;
  /** Write or check only the docs and guides the folder already holds. */
  subset: boolean;
}

const root = process.cwd();
const manifestPath = path.join(root, "docs", "docs-manifest.yaml");

function parseArgs(argv: string[]): Args {
  const args: Args = { check: false, subset: false };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--check") {
      args.check = true;
      continue;
    }
    if (arg === "--subset") {
      args.subset = true;
      continue;
    }
    if (arg === "--out") {
      const value = argv[index + 1];
      if (!value) throw new Error("Missing value for --out");
      args.outDir = value;
      index++;
      continue;
    }
    if (arg?.startsWith("--out=")) {
      args.outDir = arg.slice("--out=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function normalizeRepoPath(value: string): string {
  return value.split(path.sep).join("/").replace(/^\.\//, "");
}

function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith("---\n")) return markdown;
  const end = markdown.indexOf("\n---", 4);
  if (end === -1) return markdown;
  const after = markdown.indexOf("\n", end + 4);
  return after === -1 ? "" : markdown.slice(after + 1);
}

function stripMarkdownInline(value: string): string {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_~>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDescription(markdown: string): string | undefined {
  const lines = stripFrontmatter(markdown).split(/\r?\n/);
  let inFence = false;
  const paragraph: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("```") || line.startsWith("~~~")) {
      inFence = !inFence;
      continue;
    }
    if (
      inFence ||
      !line ||
      line.startsWith("#") ||
      line.startsWith("|") ||
      line === "---"
    ) {
      if (paragraph.length > 0) break;
      continue;
    }
    if (/^[-*+]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      if (paragraph.length > 0) break;
      continue;
    }
    paragraph.push(line);
  }

  const description = stripMarkdownInline(paragraph.join(" "));
  if (!description) return undefined;
  return description.length > 160 ? description.slice(0, 160) : description;
}

function splitLinkTarget(target: string): { pathPart: string; suffix: string } {
  const hashIndex = target.indexOf("#");
  if (hashIndex !== -1) {
    return {
      pathPart: target.slice(0, hashIndex),
      suffix: target.slice(hashIndex),
    };
  }
  return { pathPart: target, suffix: "" };
}

function isExternalTarget(target: string): boolean {
  return (
    /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(target) ||
    target.startsWith("//") ||
    target.startsWith("#")
  );
}

/** Each synced source's page: docs at /docs/<id>, guides at /guides/<id>. */
function sourceHrefs(manifest: DocsManifest): Map<string, string> {
  return new Map([
    ...manifest.docs.map((entry): [string, string] => [
      normalizeRepoPath(entry.source),
      entry.id === "index" ? "/docs" : `/docs/${entry.id}`,
    ]),
    ...manifest.guides.map((entry): [string, string] => [
      normalizeRepoPath(entry.source),
      `/guides/${entry.id}`,
    ]),
  ]);
}

function rewriteMarkdownLinks(
  markdown: string,
  sourcePath: string,
  sourceToHref: Map<string, string>,
): string {
  const sourceDir = path.posix.dirname(sourcePath);

  return markdown.replace(
    /(!?)\[([^\]]+)\]\(([^)\s]+)(\s+"[^"]*")?\)/g,
    (match, bang: string, label: string, rawTarget: string, title = "") => {
      if (bang || isExternalTarget(rawTarget)) return match;

      const { pathPart, suffix } = splitLinkTarget(rawTarget);
      const withoutLeadingSlash = pathPart.startsWith("/")
        ? pathPart.slice(1)
        : path.posix.normalize(path.posix.join(sourceDir, pathPart));
      const normalized = normalizeRepoPath(withoutLeadingSlash);

      if (pathPart.endsWith(".md")) {
        const href = sourceToHref.get(normalized);
        if (href) return `[${label}](${href}${suffix}${title})`;
      }

      const repoTarget = path.join(root, normalized);
      if (existsSync(repoTarget)) {
        const githubPath = statSync(repoTarget).isDirectory() ? "tree" : "blob";
        return `[${label}](https://github.com/rizom-ai/brains/${githubPath}/main/${normalized}${suffix}${title})`;
      }

      return match;
    },
  );
}

function quoteYaml(value: string): string {
  return JSON.stringify(value);
}

function readSource(entry: { id: string; source: string }): string {
  const sourceFile = path.join(root, entry.source);
  if (!existsSync(sourceFile)) {
    throw new Error(`Source not found for ${entry.id}: ${entry.source}`);
  }
  return readFileSync(sourceFile, "utf8");
}

function buildDoc(
  entry: DocsManifestEntry,
  sourceToHref: Map<string, string>,
): string {
  const sourceMarkdown = readSource(entry);
  const body = rewriteMarkdownLinks(
    stripFrontmatter(sourceMarkdown).trimEnd(),
    entry.source,
    sourceToHref,
  );
  const description = extractDescription(sourceMarkdown);

  const frontmatter = [
    "---",
    `title: ${quoteYaml(entry.title)}`,
    `section: ${quoteYaml(entry.section)}`,
    `order: ${entry.order}`,
    `slug: ${quoteYaml(entry.id)}`,
    ...(description ? [`description: ${quoteYaml(description)}`] : []),
    "---",
  ];

  return `${frontmatter.join("\n")}\n\n${body}\n`;
}

function buildGuide(
  entry: GuideManifestEntry,
  sourceToHref: Map<string, string>,
): string {
  const { data, content } = readMarkdownFrontmatter(readSource(entry));
  const parsed = guideFrontmatterSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Invalid guide frontmatter in ${entry.source}: ${parsed.error.message}`,
    );
  }
  // The manifest id is the guide's URL segment; a guide without a recipe
  // keeps the field absent rather than writing it as null.
  const frontmatter = Object.fromEntries(
    Object.entries({ ...parsed.data, slug: entry.id }).filter(
      ([, value]) => value !== null,
    ),
  );
  const body = rewriteMarkdownLinks(content.trim(), entry.source, sourceToHref);

  return generateMarkdown(frontmatter, `\n${body}\n`);
}

function listMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort();
}

/** Write one content folder, or with `check` report how it differs. */
function syncFolder(
  dir: string,
  expected: Map<string, string>,
  check: boolean,
): string[] {
  const relative = (fileName: string): string =>
    path.relative(root, path.join(dir, fileName));
  const stale = listMarkdownFiles(dir).filter(
    (fileName) => !expected.has(fileName),
  );

  if (check) {
    return [
      ...Array.from(expected).flatMap(([fileName, content]) => {
        const targetPath = path.join(dir, fileName);
        if (!existsSync(targetPath)) return [`missing ${relative(fileName)}`];
        return readFileSync(targetPath, "utf8") === content
          ? []
          : [`out of date ${relative(fileName)}`];
      }),
      ...stale.map((fileName) => `stale ${relative(fileName)}`),
    ];
  }

  mkdirSync(dir, { recursive: true });
  expected.forEach((content, fileName) =>
    writeFileSync(path.join(dir, fileName), content, "utf8"),
  );
  stale.forEach((fileName) => rmSync(path.join(dir, fileName)));
  return [];
}

/** The files a folder expects: all of them, or with `subset` those it holds. */
function expectedIn(
  dir: string,
  built: Map<string, string>,
  subset: boolean,
): Map<string, string> {
  if (!subset) return built;
  const held = new Set(listMarkdownFiles(dir));
  return new Map(Array.from(built).filter(([fileName]) => held.has(fileName)));
}

function syncContent(
  manifest: DocsManifest,
  outDir: string,
  { check, subset }: Pick<Args, "check" | "subset">,
): void {
  const contentRoot = path.resolve(root, outDir);
  const sourceToHref = sourceHrefs(manifest);
  const docDir = path.join(contentRoot, "doc");
  const guideDir = path.join(contentRoot, "guide");
  // Every file is built before any is written, so an invalid source
  // leaves the content repository untouched.
  const docs = expectedIn(
    docDir,
    new Map(
      manifest.docs.map((entry) => [
        `${entry.id}.md`,
        buildDoc(entry, sourceToHref),
      ]),
    ),
    subset,
  );
  const guides = expectedIn(
    guideDir,
    new Map(
      manifest.guides.map((entry) => [
        `${entry.id}.md`,
        buildGuide(entry, sourceToHref),
      ]),
    ),
    subset,
  );

  const issues = [
    ...syncFolder(docDir, docs, check),
    ...syncFolder(guideDir, guides, check),
  ];

  if (issues.length > 0) {
    console.error("Docs content sync check failed:\n");
    issues.forEach((issue) => console.error(`- ${issue}`));
    process.exit(1);
  }

  const action = check ? "checked" : "synced";
  console.log(
    `Docs content ${action} (${docs.size} docs, ${guides.size} guides)`,
  );
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (!args.outDir) {
    throw new Error("Missing required --out <content-root>");
  }
  if (!existsSync(manifestPath)) {
    throw new Error("Missing docs/docs-manifest.yaml");
  }

  const manifest = parseDocsManifest(readFileSync(manifestPath, "utf8"));
  syncContent(manifest, args.outDir, args);
} catch (error) {
  console.error(getErrorMessage(error));
  process.exit(1);
}
