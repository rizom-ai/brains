/** @jsxImportSource react */
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { FieldDescriptor, ValidationIssue } from "./api";
import { Field } from "./entity-fields";
import { FieldIssueSource } from "./field-issue-source";

const status: FieldDescriptor = {
  name: "status",
  label: "Status",
  widget: "string",
};
const issues: ValidationIssue[] = [
  { path: ["status"], message: "Choose a status" },
];

function render(source: "save" | "check"): string {
  return renderToStaticMarkup(
    <FieldIssueSource value={source}>
      <Field descriptor={status} value="" onChange={() => {}} issues={issues} />
    </FieldIssueSource>,
  );
}

describe("a field's issue", () => {
  it("says it is from the last save after a save was refused", () => {
    expect(render("save")).toContain("Last save: Choose a status");
  });

  it("is stated plainly while a new entry is being checked", () => {
    const html = render("check");
    expect(html).toContain("Choose a status");
    expect(html).not.toContain("Last save");
  });
});
