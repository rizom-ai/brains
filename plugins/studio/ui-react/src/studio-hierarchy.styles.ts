import * as stylex from "@stylexjs/stylex";

export const hierarchyStyles: Record<
  | "trail"
  | "crumb"
  | "link"
  | "group"
  | "label"
  | "folder"
  | "folderTitle"
  | "count"
  | "destination"
  | "segment"
  | "input"
  | "preview"
  | "value"
  | "error"
  | "context"
  | "mobileBar"
  | "withMobileBar"
  | "destinationFrame"
  | "creationBody"
  | "creationBodySplit"
  | "desktopCreateAction",
  stylex.StyleXStyles
> = stylex.create({
  trail: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "16px 0",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule-strong)",
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    minWidth: 0,
    overflowX: "auto",
    whiteSpace: "nowrap",
    "@media (max-width: 640px)": { gap: 6, padding: "12px 0" },
  },
  crumb: {
    flexShrink: 0,
    "@media (max-width: 640px)": {
      padding: "7px 9px",
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "var(--console-rule-strong)",
      borderRadius: 4,
    },
  },
  link: {
    color: "inherit",
    textDecoration: "none",
    ":hover": { color: "var(--console-text)" },
  },
  group: { marginTop: 20, marginBottom: 20 },
  label: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    fontFamily: "var(--console-mono)",
    fontSize: 10,
    color: "var(--console-text-muted)",
    padding: "0 4px 8px",
  },
  folder: {
    gridTemplateColumns: "36px minmax(0, 1fr) auto",
    textDecoration: "none",
    color: "var(--console-text)",
    "@media (max-width: 640px)": {
      gridTemplateColumns: "20px minmax(0, 1fr) auto",
    },
  },
  folderTitle: {
    fontFamily: "var(--console-ui)",
    fontSize: 15,
    fontWeight: 500,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  count: {
    display: "inline-flex",
    gap: 12,
    fontFamily: "var(--console-mono)",
    fontSize: 10,
    color: "var(--console-text-muted)",
    whiteSpace: "nowrap",
  },
  creationBody: {
    gridColumn: "1 / -1",
    gridRow: "2",
    display: "grid",
    gridTemplateColumns: "subgrid",
    gridTemplateRows: "auto minmax(180px, 1fr)",
    minWidth: 0,
    minHeight: 0,
    overflowY: "auto",
  },
  creationBodySplit: {
    gridRow: { default: "2", "@media (max-width: 640px)": "2 / 4" },
    gridTemplateRows: {
      default: "auto minmax(180px, 1fr)",
      "@media (max-width: 640px)": "auto 44px minmax(180px, 1fr)",
    },
  },
  destinationFrame: { gridColumn: "1 / -1", gridRow: "1" },
  destination: {
    padding: "22px 0",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule-strong)",
    marginBottom: 20,
  },
  segment: {
    display: "grid",
    gap: 8,
    fontFamily: "var(--console-ui)",
    fontSize: 13,
    maxWidth: 480,
  },
  input: {
    boxSizing: "border-box",
    width: "100%",
    padding: "10px 12px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule-strong)",
    borderRadius: 4,
    backgroundColor: "var(--console-card)",
    color: "var(--console-text)",
    fontFamily: "var(--console-mono)",
    fontSize: 13,
  },
  preview: {
    display: "grid",
    gridTemplateColumns: "90px minmax(0, 1fr)",
    gap: "10px 16px",
    margin: "20px 0 0",
    padding: "16px 0",
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    color: "var(--console-text-muted)",
    "@media (max-width: 640px)": { gridTemplateColumns: "1fr", gap: 6 },
  },
  value: {
    margin: 0,
    color: "var(--console-text)",
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
    "@media (max-width: 640px)": { marginBottom: 10 },
  },
  error: {
    color: "var(--console-text)",
    fontFamily: "var(--console-ui)",
    fontSize: 12,
  },
  context: {
    display: "block",
    fontFamily: "var(--console-mono)",
    fontSize: 10,
    color: "var(--console-text-muted)",
    marginTop: 4,
  },
  desktopCreateAction: {
    display: { default: "inline-flex", "@media (max-width: 640px)": "none" },
  },
  mobileBar: {
    display: "none",
    "@media (max-width: 640px)": {
      display: "flex",
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
      gap: 12,
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: "var(--console-frame)",
      borderTopWidth: 1,
      borderTopStyle: "solid",
      borderTopColor: "var(--console-rule-strong)",
      zIndex: 24,
      fontFamily: "var(--console-mono)",
      fontSize: 10,
    },
  },
  withMobileBar: {
    paddingBottom: {
      default: 34,
      "@media (max-width: 640px)": "calc(100px + env(safe-area-inset-bottom))",
    },
  },
});
