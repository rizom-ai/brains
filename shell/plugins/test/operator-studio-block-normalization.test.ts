import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  defineWorkspaceAction,
  safeParseRuntimeStudioOperatorView,
} from "../src";
import { normalizeStudioListItem } from "../src/operator/operator-studio-block-normalization";

const refresh = defineWorkspaceAction({
  name: "refresh",
  label: "Refresh",
  permission: "trusted",
  input: z.object({ id: z.string() }),
  output: z.object({ refreshed: z.string() }),
});
const undeclared = defineWorkspaceAction({
  name: "undeclared",
  label: "Undeclared",
  input: z.object({}),
  output: z.object({}),
});

describe("normalizeStudioListItem", () => {
  it("copies only the optional fields the item declares", () => {
    const item = {
      id: "a",
      title: "First",
      description: "About it",
      meta: "Yesterday",
      metadata: ["one"],
      tags: ["tag"],
      count: 0,
      badges: [{ label: "New" }],
      filterValues: ["open"],
      links: [
        {
          label: "Open",
          target: { kind: "external" as const, href: "https://example.com" },
        },
      ],
      tone: "good" as const,
      link: { kind: "external" as const, href: "https://example.com/a" },
    };

    expect(
      normalizeStudioListItem({ id: "b", title: "Bare" }, [], [], "trusted"),
    ).toStrictEqual({ item: { id: "b", title: "Bare" }, issues: [] });
    expect(
      normalizeStudioListItem(item, ["items", 0], [], "trusted"),
    ).toStrictEqual({ item, issues: [] });
  });

  it("normalizes the item's actions and keeps their label with them", () => {
    const normalized = normalizeStudioListItem(
      {
        id: "a",
        title: "First",
        actionsLabel: "More",
        actions: [{ action: refresh, input: { id: "a" } }],
      },
      ["blocks", 0, "items", 0],
      [refresh],
      "trusted",
    );

    expect(normalized).toStrictEqual({
      item: {
        id: "a",
        title: "First",
        actions: [
          { actionId: "refresh", label: "Refresh", input: { id: "a" } },
        ],
        actionsLabel: "More",
      },
      issues: [],
    });
  });

  it("drops the actions label when no action survives the permission check", () => {
    expect(
      normalizeStudioListItem(
        {
          id: "a",
          title: "First",
          actionsLabel: "More",
          actions: [{ action: refresh, input: { id: "a" } }],
        },
        ["blocks", 0, "items", 0],
        [refresh],
        "public",
      ),
    ).toStrictEqual({ item: { id: "a", title: "First" }, issues: [] });
  });

  it("reports action issues under the item's path", () => {
    expect(
      normalizeStudioListItem(
        {
          id: "a",
          title: "First",
          actions: [{ action: undeclared, input: {} }],
        },
        ["blocks", 2, "cells", 1, "items", 3],
        [refresh],
        "trusted",
      ),
    ).toStrictEqual({
      item: { id: "a", title: "First" },
      issues: [
        {
          path: ["blocks", 2, "cells", 1, "items", 3, "actions", 0, "action"],
          message: 'Action "undeclared" is not declared by this workspace',
        },
      ],
    });
  });
});

describe("studio list and matrix items", () => {
  function listAndMatrix(item: unknown): unknown {
    return {
      blocks: [
        { type: "list", id: "l", empty: "Empty", items: [item] },
        {
          type: "matrix",
          id: "m",
          cells: [
            { id: "c0", label: "C0", empty: "Empty", items: [] },
            { id: "c1", label: "C1", empty: "Empty", items: [item] },
          ],
        },
      ],
    };
  }

  it("normalize identically", () => {
    const item = {
      id: "a",
      title: "First",
      count: 0,
      actionsLabel: "More",
      actions: [{ action: refresh, input: { id: "a" } }],
    };
    const normalized = {
      id: "a",
      title: "First",
      count: 0,
      actions: [{ actionId: "refresh", label: "Refresh", input: { id: "a" } }],
      actionsLabel: "More",
    };

    expect(
      safeParseRuntimeStudioOperatorView(listAndMatrix(item), {
        actions: [refresh],
        permission: "trusted",
      }),
    ).toStrictEqual({
      success: true,
      data: {
        blocks: [
          { type: "list", id: "l", empty: "Empty", items: [normalized] },
          {
            type: "matrix",
            id: "m",
            cells: [
              { id: "c0", label: "C0", empty: "Empty", items: [] },
              { id: "c1", label: "C1", empty: "Empty", items: [normalized] },
            ],
          },
        ],
      },
    });
  });

  it("report action issues under their own paths", () => {
    const item = {
      id: "a",
      title: "First",
      actions: [
        { action: refresh, input: { id: "a" } },
        { action: undeclared, input: {} },
      ],
    };
    const result = safeParseRuntimeStudioOperatorView(listAndMatrix(item), {
      actions: [refresh],
      permission: "trusted",
    });

    expect(result).toEqual({
      success: false,
      issues: [
        {
          path: ["blocks", 0, "items", 0, "actions", 1, "action"],
          message: 'Action "undeclared" is not declared by this workspace',
        },
        {
          path: ["blocks", 1, "cells", 1, "items", 0, "actions", 1, "action"],
          message: 'Action "undeclared" is not declared by this workspace',
        },
      ],
    });
  });
});
