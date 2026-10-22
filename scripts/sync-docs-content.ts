#!/usr/bin/env bun

import { getErrorMessage } from "@brains/utils/error";
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

import { type DocsManifestEntry, parseDocsManifest } from "./docs-manifest";

interface Args {
  outDir?: string;
  check: boolean;
}

const root = process.cwd();
const manifestPath = path.join(root, "docs", "docs-manifest.yaml");

function parseArgs(argv: string[]): Args {
  const args: Args = { check: false };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--check") {
      args.check = true;
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

function rewriteMarkdownLinks(
  markdown: string,
  sourcePath: string,
  sourceToId: Map<string, string>,
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
        const docId = sourceToId.get(normalized);
        if (docId) {
          const href = docId === "index" ? "/docs" : `/docs/${docId}`;
          return `[${label}](${href}${suffix}${title})`;
        }
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

function buildDoc(
  entry: DocsManifestEntry,
  sourceToId: Map<string, string>,
): string {
  const sourceFile = path.join(root, entry.source);
  if (!existsSync(sourceFile)) {
    throw new Error(`Source not found for ${entry.id}: ${entry.source}`);
  }

  const sourceMarkdown = readFileSync(sourceFile, "utf8");
  const body = rewriteMarkdownLinks(
    stripFrontmatter(sourceMarkdown).trimEnd(),
    entry.source,
    sourceToId,
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

function listMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort();
}

function syncDocs(
  entries: DocsManifestEntry[],
  outDir: string,
  check: boolean,
): void {
  const contentRoot = path.resolve(root, outDir);
  const docDir = path.join(contentRoot, "doc");
  const sourceToId = new Map(
    entries.map((entry) => [normalizeRepoPath(entry.source), entry.id]),
  );
  const expected = new Map(
    entries.map((entry) => [`${entry.id}.md`, buildDoc(entry, sourceToId)]),
  );

  const issues: string[] = [];
  const existingFiles = listMarkdownFiles(docDir);
  const expectedNames = new Set(expected.keys());

  for (const [fileName, content] of expected.entries()) {
    const targetPath = path.join(docDir, fileName);
    if (check) {
      if (!existsSync(targetPath)) {
        issues.push(`missing ${path.relative(root, targetPath)}`);
        continue;
      }
      const current = readFileSync(targetPath, "utf8");
      if (current !== content) {
        issues.push(`out of date ${path.relative(root, targetPath)}`);
      }
      continue;
    }

    mkdirSync(docDir, { recursive: true });
    writeFileSync(targetPath, content, "utf8");
  }

  for (const fileName of existingFiles) {
    if (expectedNames.has(fileName)) continue;
    const targetPath = path.join(docDir, fileName);
    if (check) {
      issues.push(`stale ${path.relative(root, targetPath)}`);
    } else {
      rmSync(targetPath);
    }
  }

  if (issues.length > 0) {
    console.error("Docs content sync check failed:\n");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exit(1);
  }

  const action = check ? "checked" : "synced";
  console.log(`Docs content ${action} (${expected.size} docs)`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (!args.outDir) {
    throw new Error("Missing required --out <content-root>");
  }
  if (!existsSync(manifestPath)) {
    throw new Error("Missing docs/docs-manifest.yaml");
  }

  const entries = parseDocsManifest(readFileSync(manifestPath, "utf8"));
  syncDocs(entries, args.outDir, args.check);
} catch (error) {
  console.error(getErrorMessage(error));
  process.exit(1);
}
