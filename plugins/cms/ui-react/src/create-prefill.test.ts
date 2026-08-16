import { describe, expect, it } from "bun:test";
import type { FieldDescriptor } from "./api";
import {
  consumeCmsCreatePrefill,
  createPrefilledDraft,
  withoutCmsCreatePrefill,
} from "./create-prefill";

const titleField: FieldDescriptor = {
  name: "title",
  label: "Title",
  widget: "text",
  required: false,
};

const validPrefill = {
  version: 2,
  entityType: "note",
  title: "Review the proposal",
  body: "A collaboration proposal needs an operator decision.",
  backlink: "entity://mail-item/mail%2F1",
};

function historyState(): Record<string, unknown> {
  return { cmsCreatePrefill: { ...validPrefill } };
}

describe("CMS create prefill", () => {
  it("consumes a content-safe note handoff into a useful unsaved draft", () => {
    let cleared = false;
    const prefill = consumeCmsCreatePrefill(historyState(), "note", () => {
      cleared = true;
    });

    expect(prefill).toEqual({
      title: "Review the proposal",
      body: "A collaboration proposal needs an operator decision.",
      backlink: "entity://mail-item/mail%2F1",
    });
    expect(createPrefilledDraft([titleField], prefill)).toEqual({
      draft: { title: "Review the proposal" },
      body: [
        "A collaboration proposal needs an operator decision.",
        "",
        "## Source",
        "",
        "[Open the Inbox item](entity://mail-item/mail%2F1)",
      ].join("\n"),
    });
    expect(cleared).toBe(true);
  });

  it("removes only the consumed handoff from router history state", () => {
    expect(
      withoutCmsCreatePrefill({
        ...historyState(),
        __TSR_index: 2,
        __TSR_key: "router-key",
      }),
    ).toEqual({ __TSR_index: 2, __TSR_key: "router-key" });
  });

  it("opens an empty draft after the one-shot history state is consumed", () => {
    let state: unknown = historyState();
    const first = consumeCmsCreatePrefill(state, "note", () => {
      state = null;
    });
    const afterReload = consumeCmsCreatePrefill(state, "note", () => {
      throw new Error("empty state must not be consumed");
    });

    expect(first).toBeDefined();
    expect(afterReload).toBeUndefined();
    expect(createPrefilledDraft([titleField], afterReload)).toEqual({
      draft: {},
      body: "",
    });
  });

  it.each([
    null,
    {},
    { cmsCreatePrefill: { ...validPrefill, version: 1 } },
    {
      cmsCreatePrefill: {
        ...validPrefill,
        entityType: "post",
      },
    },
    {
      cmsCreatePrefill: {
        ...validPrefill,
        body: "x".repeat(1_001),
      },
    },
    {
      cmsCreatePrefill: {
        ...validPrefill,
        backlink: "https://evil.test/mail/1",
      },
    },
  ])("ignores malformed, cross-type, or expanded handoff state", (state) => {
    let cleared = false;
    expect(
      consumeCmsCreatePrefill(state, "note", () => {
        cleared = true;
      }),
    ).toBeUndefined();
    expect(cleared).toBe(false);
  });

  it("renders a readable source section when no summary is available", () => {
    expect(
      createPrefilledDraft([], {
        title: "Review the proposal",
        backlink: "entity://mail-item/mail-1",
      }),
    ).toEqual({
      draft: {},
      body: "## Source\n\n[Open the Inbox item](entity://mail-item/mail-1)",
    });
  });
});
