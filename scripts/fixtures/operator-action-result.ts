import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { RuntimeStudioOperatorPanelBlock } from "@brains/plugins";
import { OperatorViewRenderer } from "@brains/operator-view-react";

// Browser-only regression fixture. No services, real credentials, or clipboard I/O.
const container = document.getElementById("action-result-probe");
if (!container) throw new Error("Missing action-result fixture root");
const reference = `reference:α—/${"x".repeat(512)}`;
const columns = [
  { key: "name", label: "Name" },
  { key: "count", label: "Count", align: "center" as const },
  { key: "diagnostic", label: "Diagnostic", align: "end" as const },
];
const annotated = {
  id: "authored",
  cells: {
    name: "Authored row",
    count: 0,
    diagnostic: "Exact authored diagnostic",
  },
  compact: {
    title: "Authored row",
    description: "Source-authored compact description",
    metadata: ["2026-09-09T12:34:56Z"],
    count: 0,
  },
};
const plain = {
  id: "plain",
  cells: { name: "Plain row", count: 0, diagnostic: reference },
  actions: [
    { actionId: "inspect-row", label: "Inspect", input: { id: "plain" } },
  ],
};
const tables: RuntimeStudioOperatorPanelBlock[] = [
  {
    type: "table",
    id: "mixed",
    columns,
    rows: [annotated, plain],
    empty: "No mixed rows",
  },
  {
    type: "table",
    id: "annotated",
    columns,
    rows: [annotated],
    empty: "No annotated rows",
  },
  {
    type: "table",
    id: "plain",
    columns,
    rows: [plain],
    empty: "No plain rows",
  },
];
const flow: Extract<RuntimeStudioOperatorPanelBlock, { type: "flow" }> = {
  type: "flow",
  id: "flow-probe",
  label: "Flow fixture",
  direction: "bidirectional",
  steps: [
    { id: "idle", label: "Waiting", status: "idle" },
    {
      id: "active",
      label: "Long".repeat(30),
      status: "active",
      detail: reference,
    },
    { id: "complete", label: "Complete", status: "complete" },
    {
      id: "failed",
      label: "Failed",
      status: "failed",
      detail: "Exact failure: α—/",
    },
  ],
};
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: {
    writeText: async (value: string): Promise<void> => {
      container.dataset["copied"] = value;
    },
  },
});
createRoot(container).render(
  createElement(OperatorViewRenderer, {
    data: {
      view: {
        blocks: [
          {
            type: "action",
            actionId: "fixture-result",
            input: {},
            label: "Run result fixture",
            result: {
              title: `Exact result ${"Long".repeat(40)}`,
              fields: [
                {
                  name: "reference",
                  label: "Reference",
                  copyable: true,
                  sensitive: true,
                },
                { name: "count", label: "Count" },
                { name: "ready", label: "Ready" },
                { name: "empty", label: "Empty" },
                { name: "nested", label: "Nested" },
                { name: "missing", label: "Missing" },
              ],
            },
          },
          {
            type: "action",
            actionId: "disabled-fixture",
            input: {},
            label: "Unbroken".repeat(20),
            disabled: true,
          },
          {
            type: "action",
            actionId: "confirm-fixture",
            input: {},
            label: "Confirm fixture",
            confirmation: {
              kind: "static",
              message: "Confirm synthetic operation?",
            },
          },
          ...tables,
          {
            type: "notice",
            tone: "error",
            title: "Exact diagnostic notice",
            text: "Failure <source> α—/",
            details: [reference, "Second exact diagnostic <source>"],
          },
          flow,
          {
            type: "card",
            id: "flow-card",
            label: "Card flow",
            blocks: [{ ...flow, id: "card-flow-probe" }],
          },
          {
            type: "meters",
            id: "meters",
            items: [
              {
                id: "zero",
                label: "Zero meter",
                value: 0,
                max: 10,
                unit: "items",
                tone: "warn",
              },
              { id: "unbounded", label: "Unbounded", value: 5 },
            ],
          },
          {
            type: "progress",
            id: "progress",
            label: "Progress fixture",
            state: "waiting",
            progress: 0,
            tone: "error",
            detail: reference,
            startedAt: "2026-09-09T12:34:56Z",
            updatedAt: "2026-09-09T12:35:00Z",
          },
          {
            type: "card",
            id: "meter-card",
            label: "Card meters",
            blocks: [
              {
                type: "meters",
                id: "card-meters",
                items: [
                  { id: "first", label: "First", value: 1, max: 10 },
                  { id: "second", label: "Second", value: 2, max: 10 },
                ],
              },
            ],
          },
        ],
      },
    },
    onAction: async (action) => {
      container.dataset["lastInput"] = JSON.stringify(action.input);
      container.dataset["invocations"] = String(
        Number(container.dataset["invocations"] ?? 0) + 1,
      );
      return {
        reference,
        count: 0,
        ready: false,
        empty: null,
        nested: { ignored: true },
        undeclared: "must not appear",
      };
    },
    onOpenEntity: () => {},
  }),
);
