import { describe, expect, it } from "bun:test";

import {
  createToolCoverageLedger,
  renderToolCoverageLedger,
} from "../src/tool-ledger";
import type { TestCase } from "../src/schemas";

describe("tool coverage ledger", () => {
  it("diffs registered tools against top-level and per-turn assertions", () => {
    const testCases: TestCase[] = [
      {
        id: "agent-case",
        name: "Agent Case",
        type: "multi_turn",
        turns: [
          {
            userMessage: "Search",
            successCriteria: {
              expectedTools: [
                { toolName: "system_search", shouldBeCalled: true },
              ],
            },
          },
        ],
        successCriteria: {
          expectedTools: [{ toolName: "system_create", shouldBeCalled: false }],
        },
      },
      {
        id: "plugin-case",
        name: "Plugin Case",
        type: "plugin",
        plugin: "example",
        handler: "run",
        input: {},
        expectedOutput: {},
      },
    ];

    const ledger = createToolCoverageLedger(
      ["system_create", "system_search", "system_status"],
      testCases,
    );

    expect(ledger).toEqual({
      registeredTools: ["system_create", "system_search", "system_status"],
      assertedTools: ["system_create", "system_search"],
      missingAssertions: ["system_status"],
      staleAssertions: [],
    });
  });

  it("reports stale assertions for tools not registered in the preset", () => {
    const testCases: TestCase[] = [
      {
        id: "agent-case",
        name: "Agent Case",
        type: "tool_invocation",
        turns: [{ userMessage: "Build site" }],
        successCriteria: {
          expectedTools: [
            { toolName: "site-builder_build-site", shouldBeCalled: true },
          ],
        },
      },
    ];

    const ledger = createToolCoverageLedger(["system_status"], testCases);

    expect(ledger.missingAssertions).toEqual(["system_status"]);
    expect(ledger.staleAssertions).toEqual(["site-builder_build-site"]);
  });

  it("renders empty diff sections explicitly", () => {
    const markdown = renderToolCoverageLedger({
      registeredTools: ["system_status"],
      assertedTools: ["system_status"],
      missingAssertions: [],
      staleAssertions: [],
    });

    expect(markdown).toContain("Missing assertions: 0");
    expect(markdown).toContain("## Missing assertions\n\n(none)");
  });
});
