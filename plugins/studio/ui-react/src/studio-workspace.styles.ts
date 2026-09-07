import * as stylex from "@stylexjs/stylex";

/** Workspace measure and remaining panel slots during the shared StyleX migration. */
export const workspaceStyles: Record<
  "surface",
  stylex.StyleXStyles<{
    [key: `--operator-${string}`]: string;
    width?: string;
    boxSizing?: string;
    minWidth?: string;
    minHeight?: string;
    padding?: string;
    overflowY?: string;
  }>
> = stylex.create({
  surface: {
    width: "100%",
    boxSizing: "border-box",
    minWidth: "0",
    minHeight: "0",
    padding: "36px 36px 48px",
    overflowY: "auto",
    "@media (max-width: 640px)": {
      padding: "24px 20px calc(38px + env(safe-area-inset-bottom))",
      overflowY: "visible",
    },
    "--operator-section-family": "var(--console-ui)",
    "--operator-section-size": "14px",
    "--operator-section-weight": "700",
    "--operator-section-spacing": "0",
    "--operator-section-transform": "none",
  },
});

export function workspaceClassName(name: string): string {
  return `${name} ${stylex.props(workspaceStyles.surface).className ?? ""}`;
}
