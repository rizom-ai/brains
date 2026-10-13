/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { summaryListStyles as s } from "./operator-summary-list.styles";
import { styledProps } from "./styled-props";

export function OperatorSummaryList(props: ComponentProps<"ul">): ReactElement {
  return <ul {...styledProps(props, s.list)} />;
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
  return (
    <li {...styledProps(attributes, s.item)}>
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
  return <span {...styledProps(props, s.metadata)} />;
}
export function OperatorSummarySeparator(
  props: ComponentProps<"span">,
): ReactElement {
  return <span {...styledProps(props, s.separator)} />;
}
export function OperatorSummaryTags(
  props: ComponentProps<"div">,
): ReactElement {
  return <div {...styledProps(props, s.tags)} />;
}
export function OperatorSummaryTag(
  props: ComponentProps<"span">,
): ReactElement {
  return <span {...styledProps(props, s.tag)} />;
}
