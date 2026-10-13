/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps } from "react";
import { OperatorFrame } from "@brains/operator-view-react";
import { frameStyles as s } from "./operator-frame.styles";
import { styledProps } from "./styled-props";

function renderedClass(markup: string): string | undefined {
  return /class="([^"]*)"/.exec(markup)?.[1];
}

test("a wrapper renders the host className before its compiled classes", () => {
  const compiled = stylex.props(s.frame).className;
  const markup = renderToStaticMarkup(
    <OperatorFrame className="host" id="frame" />,
  );

  expect(compiled).toBeTruthy();
  expect(renderedClass(markup)).toBe(`host ${compiled}`);
  expect(markup).toContain('id="frame"');
});

test("a wrapper renders only the compiled classes when the host passes none", () => {
  const markup = renderToStaticMarkup(<OperatorFrame id="frame" />);

  expect(renderedClass(markup)).toBe(stylex.props(s.frame).className);
});

test("styledProps forwards conditional styles the way stylex.props does", () => {
  const host: ComponentProps<"div"> = { className: "host" };
  const withCanvas = styledProps(host, s.frame, s.canvas);
  const withoutCanvas = styledProps(host, s.frame, false);

  expect(withCanvas.className).toBe(
    `host ${stylex.props(s.frame, s.canvas).className}`,
  );
  expect(withoutCanvas.className).toBe(
    `host ${stylex.props(s.frame).className}`,
  );
});
