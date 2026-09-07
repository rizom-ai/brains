/** @jsxImportSource react */
import type { ComponentProps, ReactElement } from "react";
import { segmentedStyles as s } from "./operator-segmented.styles";
import { styledProps } from "./styled-props";

/** Hosts own roles, selection, counts, and interactions; native ARIA drives paint. */
export function OperatorSegmentedGroup(
  props: ComponentProps<"div">,
): ReactElement {
  return <div {...styledProps(props, s.group)} />;
}
export function OperatorSegmentedButton(
  props: ComponentProps<"button"> & { emphasis?: "attention" | undefined },
): ReactElement {
  const { emphasis, ...attributes } = props;
  return (
    <button
      type="button"
      {...styledProps(
        attributes,
        s.button,
        emphasis === "attention" && s.attention,
      )}
    />
  );
}
