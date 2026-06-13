import type { AppConfig } from "@brains/app";
import type { TestCase, AgentTestCase, SuccessCriteria } from "./schemas";
import { YAMLLoader } from "./loaders/yaml-loader";
import type { EvalHandlerRegistry } from "./eval-handler-registry";
import { bootEvalApp, prepareEvalEnvironment } from "./eval-environment";

export interface ToolCoverageLedger {
  registeredTools: string[];
  assertedTools: string[];
  missingAssertions: string[];
  staleAssertions: string[];
}

export interface RunToolLedgerOptions {
  config: AppConfig;
  testCasesDirs: string[];
  evalHandlerRegistry: EvalHandlerRegistry;
  brainModelPath?: string | undefined;
  cloneData: boolean;
  tags?: string[] | undefined;
}

export async function runToolCoverageLedger(
  options: RunToolLedgerOptions,
): Promise<ToolCoverageLedger> {
  const evalDbBase = prepareEvalEnvironment({
    brainModelPath: options.brainModelPath,
    cloneData: options.cloneData,
    suffix: "tool-ledger",
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
    const testCases = await loadLedgerTestCases(
      options.testCasesDirs,
      options.tags,
    );

    return createToolCoverageLedger(registeredTools, testCases);
  } finally {
    await app.getShell().shutdown();
  }
}

export function createToolCoverageLedger(
  registeredTools: string[],
  testCases: TestCase[],
): ToolCoverageLedger {
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

export function renderToolCoverageLedger(ledger: ToolCoverageLedger): string {
  return [
    "# Tool Coverage Ledger",
    "",
    `Registered tools: ${ledger.registeredTools.length}`,
    `Asserted tools: ${ledger.assertedTools.length}`,
    `Missing assertions: ${ledger.missingAssertions.length}`,
    `Stale assertions: ${ledger.staleAssertions.length}`,
    "",
    renderList("Registered tools", ledger.registeredTools),
    renderList("Asserted tools", ledger.assertedTools),
    renderList("Missing assertions", ledger.missingAssertions),
    renderList("Stale assertions", ledger.staleAssertions),
  ].join("\n");
}

async function loadLedgerTestCases(
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
