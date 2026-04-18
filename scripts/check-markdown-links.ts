#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const ignoredDirNames = new Set([
  ".git",
  "node_modules",
  ".turbo",
  ".terraform",
  ".next",
]);
const ignoredPathParts = new Set(["coverage"]);

function shouldSkipDirectory(dirPath: string): boolean {
  const parts = dirPath.split(path.sep);
  return parts.some(
    (part) => ignoredDirNames.has(part) || ignoredPathParts.has(part),
  );
}

function listMarkdownFilesFromGit(): string[] {
  try {
    const output = execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "--", "*.md"],
      {
        cwd: root,
        encoding: "utf8",
      },
    );

    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((file) => path.resolve(root, file))
      .filter((file) => !shouldSkipDirectory(file));
  } catch {
    return [];
  }
}

function walkMarkdownFiles(dirPath: string, files: string[] = []): string[] {
  if (shouldSkipDirectory(dirPath)) return files;

  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (shouldSkipDirectory(entryPath)) continue;

    if (entry.isDirectory()) {
      walkMarkdownFiles(entryPath, files);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }

  return files;
}

function collectMarkdownFiles(inputs: string[]): string[] {
  if (inputs.length === 0) {
    const gitFiles = listMarkdownFilesFromGit();
    if (gitFiles.length > 0) return gitFiles;
    return walkMarkdownFiles(root);
  }

  const files: string[] = [];

  for (const input of inputs) {
    const resolved = path.resolve(root, input);
    if (!existsSync(resolved)) continue;

    const stats = statSync(resolved);
    if (stats.isDirectory()) {
      walkMarkdownFiles(resolved, files);
      continue;
    }

    if (stats.isFile() && resolved.endsWith(".md")) {
      files.push(resolved);
    }
  }

  return files;
}

function normalizeTarget(rawTarget: string): string {
  return rawTarget
    .trim()
    .replace(/^<|>$/g, "")
    .replace(/\s+"[^"]*"$/, "")
    .replace(/\s+'[^']*'$/, "");
}

function shouldIgnoreTarget(target: string): boolean {
  return (
    target.length === 0 ||
    target.startsWith("#") ||
    target.startsWith("/") ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target)
  );
}

function auditFile(filePath: string): string[] {
  const issues: string[] = [];
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  const relativeFile = path.relative(root, filePath);
  const markdownLinkPattern = /\[[^\]]+\]\(([^)]+)\)/g;

  for (const [index, line] of lines.entries()) {
    markdownLinkPattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = markdownLinkPattern.exec(line)) !== null) {
      const rawTarget = normalizeTarget(match[1] ?? "");
      if (shouldIgnoreTarget(rawTarget)) continue;

      const fileTarget = rawTarget.split("#")[0]?.split("?")[0] ?? "";
      if (!fileTarget) continue;

      const resolvedTarget = path.resolve(path.dirname(filePath), fileTarget);
      if (!existsSync(resolvedTarget)) {
        issues.push(
          `${relativeFile}:${index + 1}: ${fileTarget} -> ${path.relative(root, resolvedTarget)}`,
        );
      }
    }
  }

  return issues;
}

const files = [...new Set(collectMarkdownFiles(args))].sort();
const issues = files.flatMap((file) => auditFile(file));

if (issues.length === 0) {
  console.log(`Markdown links OK (${files.length} files checked)`);
  process.exit(0);
}

console.error("Broken markdown links found:\n");
for (const issue of issues) {
  console.error(`- ${issue}`);
}
console.error(
  `\n${issues.length} issue(s) across ${files.length} file(s) checked`,
);
process.exit(1);
