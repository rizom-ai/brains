/** @jsxImportSource react */
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import * as stylex from "@stylexjs/stylex";
import { actionLayoutStyles as actionLayout } from "./operator-action-layout.styles";
import { formFieldStyles } from "./operator-form-field.styles";
import { CSS_COMPONENTS } from "./operator-view-host";

const { Button, Input, Select, Textarea } = CSS_COMPONENTS;

function attribute(markup: string, name: string): string | undefined {
  return new RegExp(`${name}="([^"]*)"`).exec(markup)?.[1];
}

/** Class order carries no meaning; only the set a host stylesheet sees does. */
function classes(markup: string): string[] {
  return (attribute(markup, "class") ?? "").split(" ").filter(Boolean).sort();
}

function compiled(...styles: stylex.StyleXStyles[]): string[] {
  return (stylex.props(...styles).className ?? "")
    .split(" ")
    .filter(Boolean)
    .sort();
}

describe("CSS host controls", () => {
  const xstyle = formFieldStyles.control;

  for (const [name, markup] of [
    [
      "input",
      renderToStaticMarkup(
        <Input
          xstyle={xstyle}
          className="host"
          style={{ width: 10 }}
          name="title"
        />,
      ),
    ],
    [
      "select",
      renderToStaticMarkup(
        <Select
          xstyle={xstyle}
          className="host"
          style={{ width: 10 }}
          name="title"
        />,
      ),
    ],
    [
      "textarea",
      renderToStaticMarkup(
        <Textarea
          xstyle={xstyle}
          className="host"
          style={{ width: 10 }}
          name="title"
        />,
      ),
    ],
  ] as const)
    it(`merges the host className and style into a ${name}'s compiled styles`, () => {
      expect(compiled(xstyle)).not.toEqual([]);
      expect(markup.startsWith(`<${name} `)).toBe(true);
      expect(classes(markup)).toEqual([...compiled(xstyle), "host"].sort());
      expect(attribute(markup, "style")).toBe("width:10px");
      expect(attribute(markup, "name")).toBe("title");
    });

  it("renders a control without presentation as its bare element", () => {
    const markup = renderToStaticMarkup(<Input name="title" />);

    expect(classes(markup)).toEqual([]);
    expect(attribute(markup, "style")).toBeUndefined();
    expect(attribute(markup, "name")).toBe("title");
  });

  it("merges the host className and style into a link button's compiled styles", () => {
    const markup = renderToStaticMarkup(
      <Button
        variant="link"
        xstyle={xstyle}
        className="host"
        style={{ width: 10 }}
        type="button"
      >
        Open
      </Button>,
    );

    expect(markup.startsWith("<button ")).toBe(true);
    expect(classes(markup)).toEqual(
      [...compiled(actionLayout.link, xstyle), "host"].sort(),
    );
    expect(attribute(markup, "style")).toBe("width:10px");
    expect(attribute(markup, "type")).toBe("button");
    expect(markup).toContain(">Open</button>");
  });

  it("renders a link button with only its link styles by default", () => {
    const markup = renderToStaticMarkup(<Button variant="link">Open</Button>);

    expect(classes(markup)).toEqual(compiled(actionLayout.link));
    expect(attribute(markup, "style")).toBeUndefined();
  });
});
