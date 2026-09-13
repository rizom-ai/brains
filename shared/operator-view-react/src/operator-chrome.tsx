/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { chromeStyles as s } from "./operator-chrome.styles";

function BrandText(props: { title: string; display?: boolean }): ReactElement {
  const title = props.title.trim();
  const split = title.lastIndexOf(" ");
  if (split <= 0) return <>{title}</>;
  return (
    <>
      {title.slice(0, split)}{" "}
      <em {...stylex.props(s.accent, props.display && s.displayAccent)}>
        {title.slice(split + 1)}
      </em>
    </>
  );
}

/** Identity and entry controls, without owning routes or authentication state. */
export function OperatorHeader(props: {
  title: string;
  mark: ReactNode;
  homeHref: string;
  label: string;
  actionsLabel: string;
  children: ReactNode;
  className?: string;
}): ReactElement {
  const css = stylex.props(s.header);
  return (
    <header
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
      aria-label={props.label}
    >
      <a {...stylex.props(s.brandLink, s.focus)} href={props.homeHref}>
        <span {...stylex.props(s.mark)} aria-hidden="true">
          {props.mark}
        </span>
        <strong {...stylex.props(s.brandTitle)}>
          <BrandText title={props.title} />
        </strong>
      </a>
      <nav {...stylex.props(s.headerActions)} aria-label={props.actionsLabel}>
        {props.children}
      </nav>
    </header>
  );
}

export function OperatorHeaderLink({
  variant,
  ...props
}: ComponentProps<"a"> & { variant: "primary" | "secondary" }): ReactElement {
  const css = stylex.props(s.control, s[variant], s.focus);
  return (
    <a
      {...props}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    />
  );
}

/** A supplementary icon control; the host supplies its accessible label. */
export function OperatorHeaderButton({
  desktopOnly,
  ...props
}: ComponentProps<"button"> & {
  "aria-label": string;
  desktopOnly?: boolean;
}): ReactElement {
  const css = stylex.props(
    s.control,
    s.icon,
    desktopOnly && s.desktopOnly,
    s.focus,
  );
  return (
    <button
      type="button"
      {...props}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    />
  );
}

export function OperatorMasthead(props: {
  title: string;
  description?: string | undefined;
  className?: string;
}): ReactElement {
  const css = stylex.props(s.masthead);
  return (
    <header
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    >
      <h1 {...stylex.props(s.title)}>
        <BrandText title={props.title} display />
      </h1>
      {props.description && (
        <p {...stylex.props(s.description)}>{props.description}</p>
      )}
    </header>
  );
}

/** Progressive-enhancement tab links: the host owns state, IDs, and hash behavior. */
export function OperatorSectionTabs(props: {
  label: string;
  children: ReactNode;
  className?: string;
}): ReactElement {
  const css = stylex.props(s.tabs);
  return (
    <nav
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
      aria-label={props.label}
      role="tablist"
    >
      {props.children}
    </nav>
  );
}

export function OperatorSectionTab({
  selected,
  count,
  children,
  ...props
}: ComponentProps<"a"> & { selected: boolean; count?: number }): ReactElement {
  const css = stylex.props(s.tab, s.focus);
  return (
    <a
      {...props}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
      role="tab"
      aria-selected={selected}
    >
      <span>{children}</span>
      {count !== undefined && count > 0 && (
        <span {...stylex.props(s.badge)}>{count}</span>
      )}
    </a>
  );
}
