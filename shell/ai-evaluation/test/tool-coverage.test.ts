import { describe, expect, it } from "bun:test";

import {
  createToolCoverageReport,
  renderToolCoverageReport,
} from "../src/tool-coverage";
import type { TestCase } from "../src/schemas";

describe("tool coverage report", () => {
  it("diffs registered tools against top-level, matrix, and per-turn assertions", () => {
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
        permissions: {
          anchor: {
            expectedTools: [
              { toolName: "system_update", shouldBeCalled: true },
            ],
          },
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

    const report = createToolCoverageReport(
      ["system_create", "system_search", "system_status", "system_update"],
      testCases,
    );

    expect(report).toEqual({
      registeredTools: [
        "system_create",
        "system_search",
        "system_status",
        "system_update",
      ],
      assertedTools: ["system_create", "system_search", "system_update"],
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

    const report = createToolCoverageReport(["system_status"], testCases);

    expect(report.missingAssertions).toEqual(["system_status"]);
    expect(report.staleAssertions).toEqual(["site-builder_build-site"]);
  });

  it("renders empty diff sections explicitly", () => {
    const markdown = renderToolCoverageReport({
      registeredTools: ["system_status"],
      assertedTools: ["system_status"],
      missingAssertions: [],
      staleAssertions: [],
    });

    expect(markdown).toContain("Missing assertions: 0");
    expect(markdown).toContain("## Missing assertions\n\n(none)");
  });
});
