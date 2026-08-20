import type { CSSProperties } from "react";

/** React style object extended only for standards-compliant CSS variables. */
export type CSSVariableProperties = CSSProperties & {
  [name: `--${string}`]: string | number | undefined;
};

export function cssVariables(
  properties: CSSVariableProperties,
): CSSVariableProperties {
  return properties;
}
