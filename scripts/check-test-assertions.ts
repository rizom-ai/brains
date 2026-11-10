#!/usr/bin/env bun

/**
 * Fail on tests that cannot fail.
 *
 * Four shapes, all of which pass whatever the code under test does:
 *
 *   vacuous — `expect(subject?.field).toBeUndefined()` also holds when
 *   `subject` itself is absent, so the assertion stops guarding anything the
 *   moment the subject goes missing. Same for `.toBeNull()` and every `.not.*`
 *   form. It is only a problem when nothing else in the test pins the subject.
 *
 *   unasserted — a test body that performs work and asserts nothing. "It did
 *   not throw" is rarely the claim the title makes, and is never checked.
 *
 *   tautological — `expect(true).toBe(true)` and other assertions over a
 *   literal. They document something; they check nothing.
 *
 *   instantiation — a test whose only assertions are `toBeDefined()`,
 *   `toBeTruthy()`, `not.toBeUndefined()` or `not.toBeNull()` on a value
 *   assigned from `new X(...)` or a bare `create*(...)` call, in the test or
 *   in a hook. A constructor that returned never yields `undefined`, so the
 *   only failure left is a throw the test does not claim. A looked-up value
 *   can be absent, so existence checks on one are left alone.
 *
 * The first two shapes have legitimate uses, so `docs/test-assertion-exemptions.json`
 * records the accepted ones with a reason. Anything not listed fails.
 */

import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";

const repositoryRoot = process.cwd();
const exemptionsPath = join(
  repositoryRoot,
  "docs",
  "test-assertion-exemptions.json",
);

const searchRoots = [
  "shell",
  "entities",
  "shared",
  "plugins",
  "interfaces",
  "packages",
  "sites",
];

const ruleSchema = z.enum([
  "vacuous",
  "unasserted",
  "tautological",
  "instantiation",
]);

type Rule = z.output<typeof ruleSchema>;

const exemptionSchema = z.strictObject({
  file: z.string().min(1),
  test: z.string().min(1),
  rule: ruleSchema,
  reason: z.string().min(1),
});

const exemptionsSchema = z.strictObject({
  version: z.literal(1),
  exemptions: z.array(exemptionSchema),
});

type Exemption = z.output<typeof exemptionSchema>;

/** An assertion that fails when its subject is absent, so it pins the subject. */
const PINNING =
  "toMatchObject|toEqual|toStrictEqual|toBe|toContain|toHaveProperty|toHaveLength|toBeInstanceOf|toBeDefined|toBeTruthy|toBeGreaterThan|toMatch|toBeString";

/** Holds when the subject is absent, so it guards nothing on its own. */
const VACUOUS =
  /expect\(\s*([A-Za-z_$][\w$]*)\?\.[^)]*\)\s*\.(?:toBeUndefined\(\)|toBeNull\(\)|not\.)/;

/** Any way this repo states an expectation, including its own helpers. */
const ASSERTION =
  /\b(expect|assert)[A-Za-z]*\(|\.toHaveBeenCalled|\.rejects|\.resolves|\btoThrow\b|\bwaitUntil\(|\bpollUntil\(/;

/** An expectation whose subject is a literal, so the outcome is fixed. */
const TAUTOLOGICAL =
  /expect\(\s*(?:true|false|null|undefined|-?\d+(?:\.\d+)?|"[^"]*"|'[^']*')\s*\)\s*\./;

/** An expectation that only says its subject exists. */
const EXISTENCE_ONLY =
  /expect\(\s*([A-Za-z_$][\w$]*)\s*\)\s*\.(?:toBeDefined|toBeTruthy|not\.toBeUndefined|not\.toBeNull)\(\s*\)/g;

/** A right-hand side that constructs its value and so cannot yield nothing. */
const CONSTRUCTION =
  /^(?:await\s+)?(?:new\s+([\w$.]+)|(create[A-Z][\w$]*))\s*[(<]/;

export interface Finding {
  file: string;
  line: number;
  test: string;
  rule: Rule;
  detail: string;
}

interface TestBlock {
  title: string;
  startLine: number;
  body: string[];
}

/** The right-hand sides assigned to `subject` in `text`. */
function assignmentsTo(subject: string, text: string): string[] {
  const name = subject.replace(/\$/g, "\\$");
  const assignment = new RegExp(
    `(?<![\\w$.])${name}(?:\\s*:\\s*[^=;]+)?\\s*=(?![=>])\\s*([^;\\n]+)`,
    "g",
  );
  return Array.from(text.matchAll(assignment), (match) => match[1] ?? "");
}

/** The it()/test() blocks in a file, with their bodies. */
function readTestBlocks(lines: string[]): TestBlock[] {
  const blocks: TestBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const opener = /^(\s*)(?:it|test)\((["'`])(.+?)\2/.exec(lines[i] ?? "");
    if (!opener) continue;
    const indent = (opener[1] ?? "").length;
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j] ?? "";
      if (
        /^\s*\}\)/.test(line) &&
        line.length - line.trimStart().length === indent
      ) {
        break;
      }
      body.push(line);
    }
    blocks.push({ title: opener[3] ?? "", startLine: i + 1, body });
  }
  return blocks;
}

function isCode(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.length > 0 &&
    !trimmed.startsWith("//") &&
    !trimmed.startsWith("*") &&
    !trimmed.startsWith("/*")
  );
}

function findVacuous(block: TestBlock, file: string): Finding[] {
  const scope = block.body.join("\n");
  const findings: Finding[] = [];
  block.body.forEach((line, offset) => {
    const match = VACUOUS.exec(line);
    if (!match) return;
    const subject = match[1] ?? "";
    const pinned =
      new RegExp(`expect\\(\\s*${subject}\\s*\\)\\s*\\.(?:${PINNING})`).test(
        scope,
      ) ||
      new RegExp(
        `expect\\(\\s*${subject}\\?\\.[^)]*\\)\\s*\\.(?:${PINNING})\\(`,
      ).test(scope) ||
      new RegExp(`if\\s*\\(\\s*!${subject}\\b`).test(scope) ||
      /expectDefined\(/.test(scope);
    if (pinned) return;
    findings.push({
      file,
      line: block.startLine + 1 + offset,
      test: block.title,
      rule: "vacuous",
      detail: line.trim(),
    });
  });
  return findings;
}

function findUnasserted(block: TestBlock, file: string): Finding[] {
  const scope = block.body.join("\n");
  if (ASSERTION.test(scope)) return [];
  const codeLines = block.body.filter(isCode).length;
  if (codeLines < 3) return [];
  return [
    {
      file,
      line: block.startLine,
      test: block.title,
      rule: "unasserted",
      detail: `${codeLines} lines, no assertion`,
    },
  ];
}

function findInstantiationOnly(
  block: TestBlock,
  file: string,
  outsideTests: string,
): Finding[] {
  const scope = block.body.filter(isCode).join("\n");
  const subjects = Array.from(
    scope.matchAll(EXISTENCE_ONLY),
    (match) => match[1] ?? "",
  );
  if (subjects.length === 0) return [];
  if (ASSERTION.test(scope.replace(EXISTENCE_ONLY, ""))) return [];

  const constructions = [...new Set(subjects)].map((subject) => {
    const own = assignmentsTo(subject, scope);
    const assigned =
      own.length > 0 ? own : assignmentsTo(subject, outsideTests);
    const built = assigned.map((rhs) => CONSTRUCTION.exec(rhs.trim()));
    const first = built[0];
    if (!first || built.some((match) => !match)) return undefined;
    const callee = first[1] ? `new ${first[1]}` : (first[2] ?? "");
    return `${subject} = ${callee}(...)`;
  });
  const [detail] = constructions;
  if (!detail || constructions.some((entry) => !entry)) return [];
  return [
    {
      file,
      line: block.startLine,
      test: block.title,
      rule: "instantiation",
      detail,
    },
  ];
}

function findTautological(block: TestBlock, file: string): Finding[] {
  return block.body.flatMap((line, offset) =>
    TAUTOLOGICAL.test(line)
      ? [
          {
            file,
            line: block.startLine + 1 + offset,
            test: block.title,
            rule: "tautological" as const,
            detail: line.trim(),
          },
        ]
      : [],
  );
}

function loadExemptions(): Exemption[] {
  try {
    const parsed = exemptionsSchema.parse(
      JSON.parse(readFileSync(exemptionsPath, "utf8")),
    );
    return parsed.exemptions;
  } catch (error) {
    throw new Error(`Could not read ${exemptionsPath}`, { cause: error });
  }
}

/** Every test in one file's source that cannot fail. */
export function findTestAssertionsInSource(
  file: string,
  source: string,
): Finding[] {
  const lines = source.split("\n");
  const blocks = readTestBlocks(lines);
  const inTests = new Set(
    blocks.flatMap((block) =>
      Array.from(
        { length: block.body.length + 2 },
        (_, offset) => block.startLine - 1 + offset,
      ),
    ),
  );
  const outsideTests = lines
    .filter((line, index) => !inTests.has(index) && isCode(line))
    .join("\n");
  return blocks.flatMap((block) => [
    ...findVacuous(block, file),
    ...findUnasserted(block, file),
    ...findTautological(block, file),
    ...findInstantiationOnly(block, file, outsideTests),
  ]);
}

async function collectFindings(): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const root of searchRoots) {
    const glob = new Glob("**/*.test.{ts,tsx}");
    for await (const absolute of glob.scan({ cwd: root, absolute: true })) {
      if (absolute.includes("node_modules")) continue;
      const file = absolute.replace(`${repositoryRoot}/`, "");
      findings.push(
        ...findTestAssertionsInSource(file, readFileSync(absolute, "utf8")),
      );
    }
  }
  return findings;
}

function isExempt(finding: Finding, exemptions: Exemption[]): boolean {
  return exemptions.some(
    (exemption) =>
      exemption.file === finding.file &&
      exemption.test === finding.test &&
      exemption.rule === finding.rule,
  );
}

function describe(finding: Finding): string {
  const what =
    finding.rule === "vacuous"
      ? "holds when its subject is absent"
      : finding.rule === "unasserted"
        ? "asserts nothing"
        : finding.rule === "tautological"
          ? "asserts over a literal"
          : "only asserts that a value it constructed exists";
  return [
    `${finding.file}:${finding.line}`,
    `  test: "${finding.test}"`,
    `  ${what} — ${finding.detail}`,
  ].join("\n");
}

async function main(): Promise<void> {
  const exemptions = loadExemptions();
  const findings = await collectFindings();
  const unexempt = findings.filter((f) => !isExempt(f, exemptions));

  const stale = exemptions.filter(
    (exemption) =>
      !findings.some(
        (finding) =>
          finding.file === exemption.file &&
          finding.test === exemption.test &&
          finding.rule === exemption.rule,
      ),
  );

  if (unexempt.length > 0) {
    console.error(
      `✖ ${unexempt.length} test(s) cannot fail:\n\n${unexempt
        .map(describe)
        .join("\n\n")}\n`,
    );
    console.error(
      "Assert what the test's title claims. If the shape is deliberate — a\n" +
        "lookup by an expected key, or a call that throws on failure — record\n" +
        `it with a reason in ${exemptionsPath.replace(`${repositoryRoot}/`, "")}.`,
    );
    process.exit(1);
  }

  if (stale.length > 0) {
    console.error(
      `✖ ${stale.length} exemption(s) no longer match anything and should be removed:\n` +
        stale.map((s) => `  ${s.file} — "${s.test}" (${s.rule})`).join("\n"),
    );
    process.exit(1);
  }

  console.log(
    `✔ No tests that cannot fail (${exemptions.length} documented exemption(s)).`,
  );
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(getErrorMessage(error, "Test assertion check failed"));
    process.exit(1);
  }
}
