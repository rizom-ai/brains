#!/usr/bin/env bun

/**
 * Require a reason when a wide catch turns every failure into one answer.
 *
 * A catch that neither rethrows, nor logs, nor reads the error it caught turns
 * every failure inside its try into one indistinguishable answer. Over a
 * narrow block that is usually deliberate — JSON.parse either works or does
 * not. Over a wide one it hides whatever else the block can do, and on this
 * branch that pattern was found reporting a corrupt repo as "no history", a
 * container it could not inspect as a healthy stress run, and a broken docker
 * as a free image tag.
 *
 * Logging is not an escape from that. A catch that writes a warning and hands
 * back `null` has named the failure in a place nobody reads and told its caller
 * the same thing it would say for a legitimate absence: an entity lookup that
 * cannot reach the database returns "no such entity", an upload that fails
 * returns "no image" and the post publishes without one. The log records what
 * happened; the return value decides what the program does next, and a bare
 * default decides it wrongly.
 *
 * So: past a few lines, say why — both for a catch that discards its error and
 * for one that answers with a bare default. A comment inside the catch is
 * enough. This does not judge the reason, only that someone stated one, which
 * is the difference between a decision and an oversight.
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
  // Entity packages ship the same kind of code as plugins and were outside
  // this check until now, so their catches had never been looked at.
  "entities",
];

export interface SilentCatchFinding {
  file: string;
  line: number;
  width: number;
  /**
   * `discards` — nothing in the catch looks at the error.
   * `defaults` — the catch answers with a bare default, so the caller cannot
   * tell the failure from a legitimate empty result.
   */
  reason: "discards" | "defaults";
}

/**
 * A return whose value carries nothing from the failure. Anything built from
 * the error — a message, a typed failure result — is a report, not a default.
 */
const BARE_DEFAULT_RETURN =
  /return\s+(\[\]|\{\}|null|undefined|false|true|""|''|0)\s*;/;

export function findSilentCatchesInSource(
  file: string,
  source: string,
): SilentCatchFinding[] {
  const lines = source.split("\n");
  const findings: SilentCatchFinding[] = [];

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

    // A catch that can still rethrow has narrowed to the case it means, and a
    // stated reason settles either shape, so both exempt a catch outright.
    if (/\bthrow\b/.test(text)) return;
    if (body.some((b) => /^\s*(\/\/|\/\*|\*)/.test(b))) return;

    if (BARE_DEFAULT_RETURN.test(text)) {
      findings.push({ file, line: index + 1, width, reason: "defaults" });
      return;
    }

    // Reading the error — logging it, wrapping it, returning its message —
    // keeps the failure visible, so only a bare default above overrides this.
    if (binding !== undefined && new RegExp(`\\b${binding}\\b`).test(text)) {
      return;
    }
    if (/[Ll]ogger|log\.|[Cc]onsole\./.test(text)) return;

    findings.push({ file, line: index + 1, width, reason: "discards" });
  });

  return findings;
}

async function main(): Promise<void> {
  const findings: SilentCatchFinding[] = [];
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
      findings.push(
        ...findSilentCatchesInSource(file, readFileSync(absolute, "utf8")),
      );
    }
  }

  if (findings.length > 0) {
    findings.sort((a, b) => b.width - a.width);
    console.error(
      `✖ ${findings.length} catch block(s) flatten every failure across more ` +
        `than ${MAX_UNEXPLAINED_TRY_LINES} lines without saying why:\n\n` +
        findings
          .map(
            (f) =>
              `  ${f.file}:${f.line}  (${f.width} lines, ` +
              `${f.reason === "defaults" ? "answers with a bare default" : "discards the error"})`,
          )
          .join("\n") +
        "\n",
    );
    console.error(
      "Either narrow the try to the call that can legitimately fail, answer\n" +
        "with something the caller can tell apart from success, or write a\n" +
        "comment in the catch saying what is being swallowed and why that is\n" +
        "the right answer.",
    );
    process.exit(1);
  }

  console.log("✔ Every wide catch that flattens a failure explains why.");
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(getErrorMessage(error, "Silent catch check failed"));
    process.exit(1);
  }
}
