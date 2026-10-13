/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactElement } from "react";
import { choiceStyles as s } from "./operator-choice.styles";
import { styledProps } from "./styled-props";

/** Native elements only; hosts own choices, state, counts, limits and interaction. */
export function OperatorChoiceGroup(
  props: ComponentProps<"div"> & { compact?: boolean },
): ReactElement {
  const { compact, ...attributes } = props;
  return (
    <div {...styledProps(attributes, s.group, compact && s.compactGroup)} />
  );
}
export function OperatorChoiceButton(
  props: ComponentProps<"button"> & { compact?: boolean },
): ReactElement {
  const { compact, ...attributes } = props;
  return (
    <button
      type="button"
      {...styledProps(
        attributes,
        stylex.defaultMarker(),
        s.button,
        compact && s.compactButton,
        s.focus,
      )}
    />
  );
}
export function OperatorChoiceLabel(
  props: ComponentProps<"span">,
): ReactElement {
  return <span {...styledProps(props, s.label)} />;
}
export function OperatorChoiceCount(
  props: ComponentProps<"span"> & { attention?: boolean },
): ReactElement {
  const { attention, ...attributes } = props;
  return (
    <span {...styledProps(attributes, s.count, attention && s.attention)} />
  );
}
export function OperatorChoiceTools(
  props: ComponentProps<"div">,
): ReactElement {
  return <div {...styledProps(props, s.tools)} />;
}
export function OperatorChoiceSearch(
  props: ComponentProps<"input">,
): ReactElement {
  return (
    <input
      type="search"
      autoComplete="off"
      {...styledProps(props, s.search, s.focus)}
    />
  );
}
export function OperatorChoiceToggle(
  props: ComponentProps<"button">,
): ReactElement {
  return <button type="button" {...styledProps(props, s.toggle, s.focus)} />;
}
