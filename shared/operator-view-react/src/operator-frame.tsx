/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { frameStyles as s } from "./operator-frame.styles";
import { styledProps } from "./styled-props";

export function OperatorPage(props: ComponentProps<"main">): ReactElement {
  return <main {...styledProps(props, s.page)} />;
}

export function OperatorFrame(props: ComponentProps<"div">): ReactElement {
  return <div {...styledProps(props, s.frame)} />;
}

export function OperatorCanvas(props: ComponentProps<"div">): ReactElement {
  return <div {...styledProps(props, s.canvas)} />;
}

export function OperatorSections(props: ComponentProps<"div">): ReactElement {
  return <div {...styledProps(props, s.sections)} />;
}

/** Panels remain readable until the host enhances the native section links. */
export function OperatorSection(
  props: ComponentProps<"section">,
): ReactElement {
  return <section {...styledProps(props, s.section)} />;
}

/** The host marks the enclosing tabs with data-ui-tabs-active after enhancement. */
export function OperatorSectionHeading(props: {
  children: ReactNode;
}): ReactElement {
  return (
    <header {...stylex.props(s.sectionHeading)}>
      <h2 {...stylex.props(s.sectionTitle)}>{props.children}</h2>
    </header>
  );
}

export function OperatorFooter(props: {
  mark: ReactNode;
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <footer {...styledProps({ className: props.className }, s.footer)}>
      <span {...stylex.props(s.footerMark)}>{props.mark}</span>
      <span {...stylex.props(s.footerActions)}>{props.children}</span>
    </footer>
  );
}

export function OperatorFooterLink(props: ComponentProps<"a">): ReactElement {
  return <a {...styledProps(props, s.footerLink)} />;
}
