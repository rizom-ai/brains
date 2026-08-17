/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cruise, format, getAvailableTranspilers } from "dependency-cruiser";
import extractDepcruiseOptions from "dependency-cruiser/config-utl/extract-depcruise-options";
import extractTSConfig from "dependency-cruiser/config-utl/extract-ts-config";

const EXPECTED_DEPENDENCY_CRUISER_MAJOR = 17;
const EXPECTED_TYPESCRIPT_MAJOR = 6;
const SUPPORTED_REPORTERS = new Set(["err", "text", "json", "dot"]);

function getErrorMessage(error, fallback) {
  if (error instanceof Error) return error.message;
  return fallback ?? String(error);
}

function parseReporter(args) {
  if (
    args.length !== 2 ||
    args[0] !== "--reporter" ||
    !SUPPORTED_REPORTERS.has(args[1])
  ) {
    throw new Error(
      "Architecture worker requires --reporter err|text|json|dot",
    );
  }
  return args[1];
}

async function readStandardInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function parsePayload(input) {
  const payload = JSON.parse(input);
  if (!Array.isArray(payload.selected) || payload.selected.length === 0) {
    throw new Error("Architecture worker received an empty source inventory");
  }
  if (!payload.selected.every((path) => typeof path === "string")) {
    throw new Error("Architecture source inventory contains a non-string path");
  }
  if (!Array.isArray(payload.excluded)) {
    throw new Error("Architecture worker received no exclusion inventory");
  }
  if (!Array.isArray(payload.structuralEdges)) {
    throw new Error("Architecture worker received no structural sentinels");
  }
  return payload;
}

function dependencyCruiserVersion() {
  return JSON.parse(
    readFileSync(
      join(process.cwd(), "node_modules", "dependency-cruiser", "package.json"),
      "utf8",
    ),
  ).version;
}

function assertToolchain() {
  const dependencyCruiser = dependencyCruiserVersion();
  if (
    Number.parseInt(dependencyCruiser, 10) !== EXPECTED_DEPENDENCY_CRUISER_MAJOR
  ) {
    throw new Error(
      `Unsupported dependency-cruiser ${dependencyCruiser}; expected major ${EXPECTED_DEPENDENCY_CRUISER_MAJOR}`,
    );
  }

  const typescript = getAvailableTranspilers().find(
    (transpiler) => transpiler.name === "typescript",
  );
  if (!typescript?.available) {
    throw new Error("dependency-cruiser has no supported TypeScript parser");
  }
  const match = /^typescript@(\d+)\./.exec(typescript.currentVersion);
  if (Number(match?.[1]) !== EXPECTED_TYPESCRIPT_MAJOR) {
    throw new Error(
      `dependency-cruiser loaded ${typescript.currentVersion}; expected TypeScript ${EXPECTED_TYPESCRIPT_MAJOR}`,
    );
  }
  return { dependencyCruiser, typescript: typescript.currentVersion };
}

function collectCoverageIssues(graph, payload) {
  const issues = [];
  const modules = new Map(
    graph.modules.map((module) => [module.source, module]),
  );

  for (const source of payload.selected) {
    if (!modules.has(source))
      issues.push(`selected source was not cruised: ${source}`);
  }
  for (const exclusion of payload.excluded) {
    if (modules.has(exclusion.path)) {
      issues.push(`excluded source entered the graph: ${exclusion.path}`);
    }
  }
  for (const edge of payload.structuralEdges) {
    const source = modules.get(edge.from);
    if (!source) {
      issues.push(`${edge.family} sentinel source is absent: ${edge.from}`);
      continue;
    }
    if (
      !source.dependencies.some((dependency) => dependency.resolved === edge.to)
    ) {
      issues.push(
        `${edge.family} sentinel edge is absent: ${edge.from} -> ${edge.to}`,
      );
    }
  }
  for (const module of graph.modules) {
    if (module.source.startsWith(".direnv/")) {
      issues.push(
        `local environment source entered the graph: ${module.source}`,
      );
    }
    if (/(^|\/)dist\//.test(module.source)) {
      issues.push(`generated dist source entered the graph: ${module.source}`);
    }
  }
  return issues;
}

function unresolvedCounts(graph) {
  let all = 0;
  let local = 0;
  for (const module of graph.modules) {
    for (const dependency of module.dependencies ?? []) {
      if (!dependency.couldNotResolve) continue;
      all += 1;
      if (
        dependency.module.startsWith(".") ||
        dependency.module.startsWith("/") ||
        dependency.module.startsWith("@/")
      ) {
        local += 1;
      }
    }
  }
  return { all, local };
}

async function run() {
  const reporter = parseReporter(process.argv.slice(2));
  const payload = parsePayload(await readStandardInput());
  const toolchain = assertToolchain();
  const options = await extractDepcruiseOptions("./.dependency-cruiser.js");
  const tsConfig = extractTSConfig("tsconfig.depcruise.json");
  const result = await cruise(
    payload.selected,
    { ...options, outputType: undefined },
    {},
    { tsConfig },
  );
  const graph = result.output;
  const coverageIssues = collectCoverageIssues(graph, payload);
  const unresolved = unresolvedCounts(graph);
  const report = await format(graph, { outputType: reporter });

  process.stdout.write(report.output);
  process.stderr.write(
    `architecture coverage: selected=${payload.selected.length} cruised=${graph.modules.length} excluded=${payload.excluded.length} unresolved=${unresolved.all} unresolved-local=${unresolved.local} dependency-cruiser=${toolchain.dependencyCruiser} compiler=${toolchain.typescript}\n`,
  );
  if (coverageIssues.length > 0) {
    process.stderr.write("architecture coverage failures:\n");
    for (const issue of coverageIssues) process.stderr.write(`- ${issue}\n`);
  }

  return graph.summary.error > 0 || coverageIssues.length > 0 ? 1 : 0;
}

try {
  process.exit(await run());
} catch (error) {
  console.error(getErrorMessage(error, "Architecture check failed"));
  process.exit(1);
}
