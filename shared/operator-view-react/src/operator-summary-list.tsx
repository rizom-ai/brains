/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { summaryListStyles as s } from "./operator-summary-list.styles";

export function OperatorSummaryList(props: ComponentProps<"ul">): ReactElement {
  const css = stylex.props(s.list);
  return (
    <ul
      {...props}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    />
  );
}
/** Hosts supply content, metadata, tags and filter attributes; this component owns their layout. */
export function OperatorSummaryItem(
  props: ComponentProps<"li"> & {
    heading: ReactNode;
    description?: ReactNode;
    metadata?: ReactNode;
    tags?: ReactNode;
    trailing?: ReactNode;
  },
): ReactElement {
  const { heading, description, metadata, tags, trailing, ...attributes } =
    props;
  const css = stylex.props(s.item);
  return (
    <li
      {...attributes}
      {...css}
      className={[attributes.className, css.className]
        .filter(Boolean)
        .join(" ")}
    >
      <div {...stylex.props(s.copy)} data-summary-copy>
        <span
          {...stylex.props(s.heading)}
          data-summary-heading
          title={typeof heading === "string" ? heading : undefined}
        >
          {heading}
        </span>
        {description !== undefined &&
          description !== null &&
          description !== false && (
            <span {...stylex.props(s.description)} data-summary-description>
              {description}
            </span>
          )}
        {metadata}
        {tags}
      </div>
      {trailing !== undefined && trailing !== null && trailing !== false && (
        <div {...stylex.props(s.trailing)} data-summary-trailing>
          {trailing}
        </div>
      )}
    </li>
  );
}
export function OperatorSummaryMetadata(
  props: ComponentProps<"span">,
): ReactElement {
  const css = stylex.props(s.metadata);
  return (
    <span
      {...props}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    />
  );
}
export function OperatorSummarySeparator(
  props: ComponentProps<"span">,
): ReactElement {
  const css = stylex.props(s.separator);
  return (
    <span
      {...props}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    />
  );
}
export function OperatorSummaryTags(
  props: ComponentProps<"div">,
): ReactElement {
  const css = stylex.props(s.tags);
  return (
    <div
      {...props}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    />
  );
}
export function OperatorSummaryTag(
  props: ComponentProps<"span">,
): ReactElement {
  const css = stylex.props(s.tag);
  return (
    <span
      {...props}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    />
  );
}
