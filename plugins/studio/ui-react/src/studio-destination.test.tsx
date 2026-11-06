/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import type { DestinationPreview } from "./api";
import { StudioDestination } from "./studio-hierarchy";

/** What a reader sees: all text, the field's own label, and any alert. */
function render(element: React.ReactElement): {
  text: string;
  label: string | undefined;
  alert: string | undefined;
} {
  const window = new Window();
  try {
    window.document.body.innerHTML = renderToStaticMarkup(element);
    return {
      text: window.document.body.textContent,
      label: window.document.querySelector("label")?.firstChild?.textContent,
      alert: window.document.querySelector('[role="alert"]')?.textContent,
    };
  } finally {
    window.close();
  }
}

const preview: DestinationPreview = {
  idPath: ["guides", "intro"],
  entityId: "guides:intro",
  entityLeaf: { start: 7, end: 12 },
  filePath: "note/guides/intro.md",
  fileLeaf: { start: 12, end: 17 },
};

test("names the field after the file it creates and says where it is saved", () => {
  const view = render(
    <StudioDestination
      segment="intro"
      onSegmentChange={() => {}}
      preview={preview}
      pending={false}
      error={null}
    />,
  );
  const text = view.text;
  expect(view.label).toBe("File name");
  expect(text).toContain("no slashes");
  expect(text).toContain("Saves as note/guides/intro.md");
  expect(text).not.toContain("Stored ID");
  expect(text).not.toContain("traversal");
  expect(text).not.toContain('["');
});

test("explains a rejected name in plain words", () => {
  const view = render(
    <StudioDestination
      segment="bad/slug"
      onSegmentChange={() => {}}
      preview={null}
      pending={false}
      error={null}
      issues={[
        {
          path: ["segment"],
          message: "Entity ID path segments cannot contain path separators",
        },
      ]}
    />,
  );
  expect(view.alert).toBe(
    "Leave out slashes: the file name is a single name, not a path.",
  );
});
