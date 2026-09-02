#!/usr/bin/env bun

/**
 * Require a reason when a wide catch discards its error.
 *
 * A catch that neither rethrows, nor logs, nor reads the error it caught turns
 * every failure inside its try into one indistinguishable answer. Over a
 * narrow block that is usually deliberate — JSON.parse either works or does
 * not. Over a wide one it hides whatever else the block can do, and on this
 * branch that pattern was found reporting a corrupt repo as "no history", a
 * container it could not inspect as a healthy stress run, and a broken docker
 * as a free image tag.
 *
 * So: past a few lines, say why. A comment inside the catch is enough. This
 * does not judge the reason, only that someone stated one — which is the
 * difference between a decision and an oversight.
 */

import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { getErrorMessage } from "@brains/utils/error";

const repositoryRoot = process.cwd();

/** Below this, a catch is narrow enough that its subject is self-evident. */
const MAX_UNEXPLAINED_TRY_LINES = 5;

const searchRoots = [
  "shell",
  "shared",
  "plugins",
  "interfaces",
  "packages",
  "sites",
];

interface Finding {
  file: string;
  line: number;
  width: number;
}

function findInFile(file: string, source: string): Finding[] {
  const lines = source.split("\n");
  const findings: Finding[] = [];

  lines.forEach((line, index) => {
    const opener = /^(\s*)\}\s*catch\s*(\((\w+)[^)]*\))?\s*\{/.exec(line);
    if (!opener) return;
    const indent = (opener[1] ?? "").length;
    const binding = opener[3];

    let tryLine = -1;
    for (let j = index - 1; j >= 0; j--) {
      const candidate = lines[j] ?? "";
      if (
        /^\s*try\s*\{\s*$/.test(candidate) &&
        candidate.length - candidate.trimStart().length === indent
      ) {
        tryLine = j;
        break;
      }
    }
    if (tryLine < 0) return;

    const width = index - tryLine - 1;
    if (width <= MAX_UNEXPLAINED_TRY_LINES) return;

    const body: string[] = [];
    for (let j = index + 1; j < lines.length; j++) {
      const candidate = lines[j] ?? "";
      if (
        candidate.trim() === "}" &&
        candidate.length - candidate.trimStart().length === indent
      ) {
        break;
      }
      body.push(candidate);
    }

    const text = body.join("\n");
    if (/\bthrow\b/.test(text)) return;
    if (binding !== undefined && new RegExp(`\\b${binding}\\b`).test(text)) {
      return;
    }
    if (/logger|log\.|console\./.test(text)) return;
    if (body.some((b) => /^\s*(\/\/|\/\*|\*)/.test(b))) return;

    findings.push({ file, line: index + 1, width });
  });

  return findings;
}

try {
  const findings: Finding[] = [];
  for (const root of searchRoots) {
    const glob = new Glob("**/*.{ts,tsx}");
    for await (const absolute of glob.scan({ cwd: root, absolute: true })) {
      if (
        absolute.includes("node_modules") ||
        absolute.includes("/dist/") ||
        absolute.includes(".test.")
      ) {
        continue;
      }
      const file = absolute.replace(`${repositoryRoot}/`, "");
      findings.push(...findInFile(file, readFileSync(absolute, "utf8")));
    }
  }

  if (findings.length > 0) {
    findings.sort((a, b) => b.width - a.width);
    console.error(
      `✖ ${findings.length} catch block(s) discard their error across more than ` +
        `${MAX_UNEXPLAINED_TRY_LINES} lines without saying why:\n\n` +
        findings
          .map((f) => `  ${f.file}:${f.line}  (${f.width} lines)`)
          .join("\n") +
        "\n",
    );
    console.error(
      "Either narrow the try to the call that can legitimately fail, surface\n" +
        "the error, or write a comment in the catch saying what is being\n" +
        "swallowed and why that is the right answer.",
    );
    process.exit(1);
  }

  console.log("✔ Every wide catch that discards its error explains why.");
} catch (error) {
  console.error(getErrorMessage(error, "Silent catch check failed"));
  process.exit(1);
}
