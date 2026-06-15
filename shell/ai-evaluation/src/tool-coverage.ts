import type { AppConfig } from "@brains/app";
import type { TestCase, AgentTestCase, SuccessCriteria } from "./schemas";
import { YAMLLoader } from "./loaders/yaml-loader";
import type { EvalHandlerRegistry } from "./eval-handler-registry";
import { bootEvalApp, prepareEvalEnvironment } from "./eval-environment";

export interface ToolCoverageReport {
  registeredTools: string[];
  assertedTools: string[];
  missingAssertions: string[];
  staleAssertions: string[];
}

export interface RunToolCoverageOptions {
  config: AppConfig;
  testCasesDirs: string[];
  evalHandlerRegistry: EvalHandlerRegistry;
  brainModelPath?: string | undefined;
  cloneData: boolean;
  tags?: string[] | undefined;
}

export async function runToolCoverageReport(
  options: RunToolCoverageOptions,
): Promise<ToolCoverageReport> {
  const evalDbBase = prepareEvalEnvironment({
    brainModelPath: options.brainModelPath,
    cloneData: options.cloneData,
    suffix: "tool-coverage",
  });

  const app = await bootEvalApp({
    evalDbBase,
    config: options.config,
    evalHandlerRegistry: options.evalHandlerRegistry,
  });

  try {
    const shell = app.getShell();
    const registeredTools = shell
      .listToolsForPermissionLevel("anchor")
      .map((tool) => tool.name);
    const testCases = await loadCoverageTestCases(
      options.testCasesDirs,
      options.tags,
    );

    return createToolCoverageReport(registeredTools, testCases);
  } finally {
    await app.getShell().shutdown();
  }
}

export function createToolCoverageReport(
  registeredTools: string[],
  testCases: TestCase[],
): ToolCoverageReport {
  const registered = uniqueSorted(registeredTools);
  const asserted = uniqueSorted(collectAssertedToolNames(testCases));
  const registeredSet = new Set(registered);
  const assertedSet = new Set(asserted);

  return {
    registeredTools: registered,
    assertedTools: asserted,
    missingAssertions: registered.filter((tool) => !assertedSet.has(tool)),
    staleAssertions: asserted.filter((tool) => !registeredSet.has(tool)),
  };
}

export function renderToolCoverageReport(report: ToolCoverageReport): string {
  return [
    "# Tool Coverage Report",
    "",
    `Registered tools: ${report.registeredTools.length}`,
    `Asserted tools: ${report.assertedTools.length}`,
    `Missing assertions: ${report.missingAssertions.length}`,
    `Stale assertions: ${report.staleAssertions.length}`,
    "",
    renderList("Registered tools", report.registeredTools),
    renderList("Asserted tools", report.assertedTools),
    renderList("Missing assertions", report.missingAssertions),
    renderList("Stale assertions", report.staleAssertions),
  ].join("\n");
}

async function loadCoverageTestCases(
  testCasesDirs: string[],
  tags: string[] | undefined,
): Promise<TestCase[]> {
  const loader = YAMLLoader.createFresh({
    directory: testCasesDirs,
    recursive: true,
  });
  const tagSet = tags?.length ? new Set(tags) : undefined;
  const testCases = await loader.loadTestCases();
  if (!tagSet) return testCases;

  return testCases.filter((testCase) =>
    testCase.tags?.some((tag) => tagSet.has(tag)),
  );
}

function collectAssertedToolNames(testCases: TestCase[]): string[] {
  const tools: string[] = [];
  for (const testCase of testCases) {
    if (testCase.type === "plugin") continue;
    collectFromCriteria(tools, testCase.successCriteria);
    for (const criteria of Object.values(
      (testCase as AgentTestCase).permissions ?? {},
    )) {
      collectFromCriteria(tools, criteria);
    }
    for (const turn of (testCase as AgentTestCase).turns) {
      collectFromCriteria(tools, turn.successCriteria);
    }
  }
  return tools;
}

function collectFromCriteria(
  tools: string[],
  criteria: SuccessCriteria | undefined,
): void {
  for (const expectedTool of criteria?.expectedTools ?? []) {
    tools.push(expectedTool.toolName);
  }
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function renderList(title: string, values: string[]): string {
  if (values.length === 0) return `## ${title}\n\n(none)\n`;
  return [`## ${title}`, "", ...values.map((value) => `- ${value}`), ""].join(
    "\n",
  );
}
