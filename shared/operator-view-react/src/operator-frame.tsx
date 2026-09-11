/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { frameStyles as s } from "./operator-frame.styles";

export function OperatorPage(props: ComponentProps<"main">): ReactElement {
  const css = stylex.props(s.page);
  return (
    <main
      {...props}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    />
  );
}

export function OperatorFrame(props: ComponentProps<"div">): ReactElement {
  const css = stylex.props(s.frame);
  return (
    <div
      {...props}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    />
  );
}

export function OperatorCanvas(props: ComponentProps<"div">): ReactElement {
  const css = stylex.props(s.canvas);
  return (
    <div
      {...props}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    />
  );
}

export function OperatorSections(props: ComponentProps<"div">): ReactElement {
  const css = stylex.props(s.sections);
  return (
    <div
      {...props}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    />
  );
}

/** Panels remain readable until the host enhances the native section links. */
export function OperatorSection(
  props: ComponentProps<"section">,
): ReactElement {
  const css = stylex.props(s.section);
  return (
    <section
      {...props}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    />
  );
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
  const css = stylex.props(s.footer);
  return (
    <footer
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    >
      <span {...stylex.props(s.footerMark)}>{props.mark}</span>
      <span {...stylex.props(s.footerActions)}>{props.children}</span>
    </footer>
  );
}

export function OperatorFooterLink(props: ComponentProps<"a">): ReactElement {
  const css = stylex.props(s.footerLink);
  return (
    <a
      {...props}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    />
  );
}
