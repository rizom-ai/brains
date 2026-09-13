import * as stylex from "@stylexjs/stylex";
import { headStyles } from "./studio-page-head.styles";
import { typographyStyles } from "./studio-typography.styles";

/** Workspace measure and remaining panel slots during the shared StyleX migration. */
export const workspaceStyles: Record<
  "surface",
  stylex.StyleXStyles<{
    [key: `--operator-${string}`]: string;
    width?: string;
    boxSizing?: string;
    minWidth?: string;
    minHeight?: string;
    paddingBottom?: string;
    overflowY?: string;
  }>
> = stylex.create({
  surface: {
    width: "100%",
    boxSizing: "border-box",
    minWidth: "0",
    minHeight: "0",
    paddingBottom: "48px",
    overflowY: "auto",
    "@media (max-width: 640px)": {
      paddingBottom: "calc(38px + env(safe-area-inset-bottom))",
      overflowY: "visible",
      "--operator-sections-gap": "22px",
      "--operator-sections-padding-top": "18px",
    },
    "--operator-section-spacing": "0",
    "--operator-section-transform": "none",
  },
});

export function workspaceClassName(name: string): string {
  return `${name} ${stylex.props(workspaceStyles.surface, headStyles.inset, typographyStyles.operatorRoles).className ?? ""}`;
}
