/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StudioSystemFields } from "./studio-system-fields";
import type { FieldDescriptor } from "./api";

const visibility: FieldDescriptor = {
  name: "visibility",
  label: "Visibility",
  widget: "select",
  options: ["shared", "restricted"],
};

for (const readOnly of [true, false]) {
  test(`omits the empty Access section for grouping vocabularies (readOnly=${readOnly})`, () => {
    const html = renderToStaticMarkup(
      <StudioSystemFields
        fields={[]}
        draft={{
          groupings: { clients: { multiple: false, values: ["Acme"] } },
        }}
        title="Access"
        readOnly={readOnly}
        onChange={() => {}}
      />,
    );
    expect(html).toBe("");
  });

  test(`omits sections when every field is conditionally hidden (readOnly=${readOnly})`, () => {
    const html = renderToStaticMarkup(
      <StudioSystemFields
        fields={[
          { ...visibility, condition: { field: "showAccess", value: true } },
        ]}
        draft={{ showAccess: false, visibility: "shared" }}
        title="Access"
        readOnly={readOnly}
        onChange={() => {}}
      />,
    );
    expect(html).toBe("");
  });
}

test("omits a read-only section with only absent optional fields", () => {
  const html = renderToStaticMarkup(
    <StudioSystemFields
      fields={[{ ...visibility, required: false }]}
      draft={{}}
      title="Access"
      readOnly
      onChange={() => {}}
    />,
  );
  expect(html).toBe("");
});

test("retains populated and required read-only fields", () => {
  const html = renderToStaticMarkup(
    <StudioSystemFields
      fields={[
        visibility,
        { name: "title", label: "Title", widget: "string", required: true },
      ]}
      draft={{ visibility: "shared" }}
      title="Access"
      readOnly
      onChange={() => {}}
    />,
  );
  expect(html).toContain("Access");
  expect(html).toContain("Visibility");
  expect(html).toContain("shared");
  expect(html).toContain("Title");
  expect(html).toContain("Not set");
});

test("retains absent optional fields in the editable form", () => {
  const html = renderToStaticMarkup(
    <StudioSystemFields
      fields={[
        {
          name: "summary",
          label: "Summary",
          widget: "string",
          required: false,
        },
      ]}
      draft={{}}
      title="Properties"
      readOnly={false}
      onChange={() => {}}
    />,
  );
  expect(html).toContain("Properties");
  expect(html).toContain("Summary");
  expect(html).toContain("<textarea");
});
