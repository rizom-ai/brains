/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactElement } from "react";
import { choiceStyles as s } from "./operator-choice.styles";

/** Native elements only; hosts own choices, state, counts, limits and interaction. */
export function OperatorChoiceGroup(
  props: ComponentProps<"div"> & { compact?: boolean },
): ReactElement {
  const { compact, ...attributes } = props;
  const css = stylex.props(s.group, compact && s.compactGroup);
  return (
    <div
      {...attributes}
      {...css}
      className={[attributes.className, css.className]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
export function OperatorChoiceButton(
  props: ComponentProps<"button"> & { compact?: boolean },
): ReactElement {
  const { compact, ...attributes } = props;
  const css = stylex.props(
    stylex.defaultMarker(),
    s.button,
    compact && s.compactButton,
    s.focus,
  );
  return (
    <button
      type="button"
      {...attributes}
      {...css}
      className={[attributes.className, css.className]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
export function OperatorChoiceLabel(
  props: ComponentProps<"span">,
): ReactElement {
  const css = stylex.props(s.label);
  return (
    <span
      {...props}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    />
  );
}
export function OperatorChoiceCount(
  props: ComponentProps<"span"> & { attention?: boolean },
): ReactElement {
  const { attention, ...attributes } = props;
  const css = stylex.props(s.count, attention && s.attention);
  return (
    <span
      {...attributes}
      {...css}
      className={[attributes.className, css.className]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
export function OperatorChoiceTools(
  props: ComponentProps<"div">,
): ReactElement {
  const css = stylex.props(s.tools);
  return (
    <div
      {...props}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    />
  );
}
export function OperatorChoiceSearch(
  props: ComponentProps<"input">,
): ReactElement {
  const css = stylex.props(s.search, s.focus);
  return (
    <input
      type="search"
      autoComplete="off"
      {...props}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    />
  );
}
export function OperatorChoiceToggle(
  props: ComponentProps<"button">,
): ReactElement {
  const css = stylex.props(s.toggle, s.focus);
  return (
    <button
      type="button"
      {...props}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    />
  );
}
