/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import {
  OperatorViewRenderer,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";
import type { RuntimeStudioWorkspaceData } from "@brains/plugins";

type Master = Extract<
  RuntimeStudioWorkspaceData["view"]["blocks"][number],
  { type: "detail" }
>["master"];

const card = (
  id: string,
  title: string,
): { id: string; title: string; link: { kind: "detail"; itemId: string } } => ({
  id,
  title,
  link: { kind: "detail", itemId: id },
});

const board: Master = {
  type: "matrix",
  id: "board",
  columns: 2,
  cells: [
    {
      id: "open",
      label: "To do",
      empty: "Nothing waiting.",
      items: [card("fix-rss", "Fix RSS"), card("venue", "Book the venue")],
    },
  ],
};

const table: Master = {
  type: "table",
  id: "people",
  empty: "No one yet.",
  columns: [
    { key: "name", label: "Name" },
    { key: "role", label: "Role" },
  ],
  rows: [
    {
      id: "mira",
      cells: { name: "Mira Reyes", role: "Admin" },
      link: { kind: "detail" as const, itemId: "mira" },
    },
    {
      id: "sam",
      cells: { name: "Sam Rivera", role: "Trusted" },
      link: { kind: "detail" as const, itemId: "sam" },
    },
  ],
};

/** The classes on `element` whose compiled rule is the open-row tint. */
function tintClasses(element: { classList: Iterable<string> }): string[] {
  return [...element.classList].filter((name) =>
    operatorViewStylexCSS.includes(
      `.${name}:not(#\\#):not(#\\#):not(#\\#){background-color:color-mix(in srgb,var(--console-text) 5%,transparent)}`,
    ),
  );
}

function render(master: Master, open?: string): Window {
  const html = renderToStaticMarkup(
    <OperatorViewRenderer
      data={{
        view: {
          blocks: [
            {
              type: "detail",
              id: "detail",
              queryKey: "open",
              empty: "Select one.",
              master,
              ...(open
                ? {
                    open: {
                      forId: open,
                      title: "Opened",
                      blocks: [{ type: "text", id: "body", text: "Body" }],
                    },
                  }
                : {}),
            },
          ],
        },
      }}
      onAction={async () => ({})}
      onOpenEntity={() => {}}
      query={open ? { open } : {}}
    />,
  );
  const window = new Window({ width: 1440 });
  window.document.head.innerHTML = `<style>${operatorViewStylexCSS}</style>`;
  window.document.body.innerHTML = html;
  return window;
}

test("an open card's marker sits in a gutter its column reserves, never on the text", async () => {
  const window = render(board, "fix-rss");
  try {
    const rows = [...window.document.querySelectorAll("[data-matrix-cell] li")];
    const selected = rows.find((row) => row.getAttribute("aria-current"));
    const other = rows.find((row) => !row.getAttribute("aria-current"));
    if (!selected || !other) throw new Error("Missing board rows");
    const style = window.getComputedStyle(selected);
    expect(style.boxShadow).toContain("inset 2px 0 0");
    expect(style.paddingLeft).toBe("14px");
    expect(style.paddingRight).toBe("14px");
    // Every row of an open master keeps the same gutter, so titles align.
    expect(window.getComputedStyle(other).paddingLeft).toBe("14px");
    // A neutral tint marks the row where the card surface matches its column.
    expect(tintClasses(selected)).toHaveLength(1);
  } finally {
    await window.happyDOM.close();
  }
});

test("a master with nothing open keeps its rows flush", async () => {
  const window = render(board);
  try {
    const row = window.document.querySelector("[data-matrix-cell] li");
    if (!row) throw new Error("Missing board row");
    expect(window.getComputedStyle(row).paddingLeft).toBe("0px");
  } finally {
    await window.happyDOM.close();
  }
});

test("an open table row's marker sits in a gutter too", async () => {
  const window = render(table, "mira");
  try {
    const cells = [
      ...window.document.querySelectorAll("tbody tr > td:first-child"),
    ];
    const current = cells.find((cell) =>
      cell.parentElement?.getAttribute("aria-current"),
    );
    const other = cells.find(
      (cell) => !cell.parentElement?.getAttribute("aria-current"),
    );
    if (!current || !other) throw new Error("Missing table rows");
    expect(window.getComputedStyle(current).paddingLeft).toBe("14px");
    expect(window.getComputedStyle(other).paddingLeft).toBe("14px");
    // The open table row looks like an open list row: the same tint and edge.
    const row = current.parentElement;
    if (!row) throw new Error("Missing current row");
    expect(tintClasses(row)).toHaveLength(1);
  } finally {
    await window.happyDOM.close();
  }
  const closed = render(table);
  try {
    const cell = closed.document.querySelector("tbody tr > td:first-child");
    if (!cell) throw new Error("Missing table cell");
    expect(closed.getComputedStyle(cell).paddingLeft).toBe("0px");
  } finally {
    await closed.happyDOM.close();
  }
});
