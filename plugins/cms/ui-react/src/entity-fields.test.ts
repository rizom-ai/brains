import { describe, expect, it } from "bun:test";
import type { FieldDescriptor } from "./api";
import { isFieldVisible, visibleFieldValues } from "./entity-fields";

const conditionalField: FieldDescriptor = {
  name: "focusAreas",
  label: "Focus Areas",
  widget: "list",
  condition: {
    field: "kind",
    value: ["team", "organization"],
  },
};

describe("isFieldVisible", () => {
  it("shows unconditional fields", () => {
    expect(
      isFieldVisible({ name: "name", label: "Name", widget: "string" }, {}),
    ).toBe(true);
  });

  it("shows fields when the controlling value matches", () => {
    expect(isFieldVisible(conditionalField, { kind: "team" })).toBe(true);
    expect(isFieldVisible(conditionalField, { kind: "organization" })).toBe(
      true,
    );
  });

  it("hides fields for other profile kinds", () => {
    expect(isFieldVisible(conditionalField, { kind: "person" })).toBe(false);
  });

  it("removes hidden variant fields from save payloads", () => {
    const roleField: FieldDescriptor = {
      name: "role",
      label: "Role",
      widget: "string",
      condition: { field: "kind", value: "person" },
    };
    const fields: FieldDescriptor[] = [
      { name: "name", label: "Name", widget: "string" },
      { name: "kind", label: "Kind", widget: "select" },
      roleField,
      conditionalField,
    ];

    expect(
      visibleFieldValues(fields, {
        name: "Example Team",
        kind: "team",
        role: "Old person role",
        focusAreas: ["Research"],
      }),
    ).toEqual({
      name: "Example Team",
      kind: "team",
      focusAreas: ["Research"],
    });
  });
});
