/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactElement } from "react";
import { mapSvgStyles as s } from "./operator-map-svg.styles";
import { styledProps } from "./styled-props";

/** Hosts own geometry, IDs, and selection; descendants read explicit group state. */
export function OperatorMapGroup(
  props: ComponentProps<"g"> & { bloom?: boolean; dimmed?: boolean },
): ReactElement {
  const { bloom, dimmed, ...attributes } = props;
  return (
    <g
      {...styledProps(
        attributes,
        stylex.defaultMarker(),
        bloom && s.bloom,
        dimmed && s.dimmed,
      )}
    />
  );
}

export function OperatorMapPath(
  props: ComponentProps<"path"> & {
    presentation: "trace" | "contour" | "connector" | "stem" | "node";
    emphasis?: "major" | "middle" | "inner" | undefined;
    tone?: "neutral" | "warn" | "secondary";
  },
): ReactElement {
  const { presentation, emphasis, tone, ...attributes } = props;
  return (
    <path
      {...styledProps(
        attributes,
        s[presentation],
        (presentation === "trace" || presentation === "contour") && s.draw,
        presentation === "trace" && emphasis === "major" && s.major,
        presentation === "contour" && emphasis === "middle" && s.middle,
        presentation === "contour" && emphasis === "inner" && s.inner,
        presentation === "node" && tone === "warn" && s.nodeWarn,
        presentation === "node" && tone === "secondary" && s.nodeSecondary,
      )}
    />
  );
}

export function OperatorMapCircle(
  props: ComponentProps<"circle"> & {
    presentation:
      | "anchor"
      | "point"
      | "distance"
      | "region"
      | "spore"
      | "identity"
      | "halo"
      | "glow"
      | "node";
    tone?: "neutral" | "good" | "warn" | "secondary";
    hollow?: boolean;
  },
): ReactElement {
  const { presentation, tone, hollow, ...attributes } = props;
  return (
    <circle
      {...styledProps(
        attributes,
        s[presentation],
        presentation === "point" && tone === "good" && s.pointGood,
        presentation === "point" && tone === "warn" && s.pointWarn,
        presentation === "point" && tone === "secondary" && s.pointSecondary,
        presentation === "point" && hollow && s.hollow,
        presentation === "node" && tone === "warn" && s.nodeWarn,
        presentation === "node" && tone === "secondary" && s.nodeSecondary,
        presentation === "node" && tone === "good" && s.nodeGood,
      )}
    />
  );
}

export function OperatorMapText(
  props: ComponentProps<"text"> & {
    presentation:
      "region" | "axis" | "distance" | "group" | "identity" | "node";
  },
): ReactElement {
  const { presentation, ...attributes } = props;
  return (
    <text
      {...styledProps(
        attributes,
        (presentation === "region" ||
          presentation === "axis" ||
          presentation === "group") &&
          s.labelBase,
        presentation === "region" && s.regionText,
        presentation === "axis" && s.axisText,
        presentation === "distance" && s.distanceText,
        presentation === "group" && s.groupText,
        presentation === "identity" && s.identityText,
        presentation === "node" && s.nodeText,
      )}
    />
  );
}

export function OperatorMapCount(props: ComponentProps<"tspan">): ReactElement {
  return <tspan {...styledProps(props, s.labelBase, s.count)} />;
}
