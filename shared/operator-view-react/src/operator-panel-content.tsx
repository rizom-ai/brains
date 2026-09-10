/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { panelContentStyles as s } from "./operator-panel-content.styles";

export function OperatorPanelParagraph(
  props: ComponentProps<"p"> & {
    lead?: ReactNode;
    children: ReactNode;
    presentation?: "note" | "muted";
  },
): ReactElement {
  const { lead, children, presentation, ...attributes } = props;
  const css = stylex.props(
    presentation === "note"
      ? s.note
      : presentation === "muted"
        ? s.muted
        : s.paragraph,
  );
  return (
    <p
      {...attributes}
      {...css}
      className={[attributes.className, css.className]
        .filter(Boolean)
        .join(" ")}
    >
      {lead !== undefined && <b {...stylex.props(s.lead)}>{lead}</b>}
      {children}
    </p>
  );
}

/** Status copy and tone are supplied by the host, never inferred from a route. */
export function OperatorPanelStatus(props: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "error";
}): ReactElement {
  return (
    <span
      {...stylex.props(
        s.status,
        props.tone === "good" && s.good,
        props.tone === "warn" && s.warn,
        props.tone === "error" && s.error,
      )}
      data-tone={props.tone ?? "neutral"}
    >
      {props.children}
    </span>
  );
}

export function OperatorPanelEmpty(props: {
  children: ReactNode;
}): ReactElement {
  return <p {...stylex.props(s.empty)}>{props.children}</p>;
}

export function OperatorPanelList(props: {
  children: ReactNode;
}): ReactElement {
  return <ul {...stylex.props(s.list)}>{props.children}</ul>;
}

/** Compact summary rows are distinct from the renderer's full record lists. */
export function OperatorPanelListItem(
  props: Omit<ComponentProps<"li">, "children"> & {
    label: string;
    description?: string | undefined;
    badge: string;
    href?: string | undefined;
    tone?: "neutral" | "secondary" | "good";
  },
): ReactElement {
  const { label, description, badge, href, tone, ...attributes } = props;
  const css = stylex.props(s.row);
  const content = (
    <>
      <span {...stylex.props(s.copy)}>
        <strong {...stylex.props(s.label)}>
          {tone === "good" && (
            <span {...stylex.props(s.marker)} aria-hidden="true" />
          )}
          {label}
        </strong>
        {description !== undefined && (
          <em {...stylex.props(s.description)}>{description}</em>
        )}
      </span>
      <small
        {...stylex.props(
          s.badge,
          tone === "secondary" && s.secondaryBadge,
          tone === "good" && s.goodBadge,
        )}
      >
        {badge}
      </small>
    </>
  );
  return (
    <li
      {...attributes}
      {...css}
      className={[attributes.className, css.className]
        .filter(Boolean)
        .join(" ")}
      data-tone={tone ?? "neutral"}
    >
      {href !== undefined ? (
        <a href={href} {...stylex.props(stylex.defaultMarker(), s.link)}>
          {content}
        </a>
      ) : (
        content
      )}
    </li>
  );
}
