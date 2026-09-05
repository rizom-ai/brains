import * as stylex from "@stylexjs/stylex";

// Compiled by the Studio UI build. All materials remain climate-owned tokens;
// named classes in the markup are automation hooks, not styling contracts.
type NavigationStyle =
  | "shellCollapsed"
  | "navigationCollapsed"
  | "collapsedLabel"
  | "collapsedLink"
  | "collapsedTitle"
  | "collapseButton"
  | "mobileSummary"
  | "mobileCurrent"
  | "mobileDisclosure"
  | "shell"
  | "rail"
  | "navigation"
  | "areaRail"
  | "areaTitle"
  | "areaLink"
  | "areaActive"
  | "ordinal"
  | "ordinalActive"
  | "leaf"
  | "leafHead"
  | "leafKicker"
  | "leafTitle"
  | "leafDescription"
  | "leafScroll"
  | "leafGroup"
  | "leafLabel"
  | "list"
  | "leafLink"
  | "leafActive"
  | "count"
  | "singleton"
  | "mobileHost"
  | "browse"
  | "chromeHeader"
  | "chromeBrand"
  | "chromeLocation"
  | "locationText"
  | "locationLabel"
  | "chromeUtility"
  | "areaFoot"
  | "sheet"
  | "sheetList"
  | "sheetOverlay"
  | "sheetHead"
  | "sheetTitle"
  | "sheetClose"
  | "mobileDock"
  | "dockLink"
  | "dockActive"
  | "mobileGroup"
  | "mobileLabel"
  | "mobileLink"
  | "mobileActive";

export const navigationStyles: Record<NavigationStyle, stylex.StyleXStyles> =
  stylex.create({
    shell: {
      gridTemplateColumns: "344px minmax(0, 1fr)",
      "@media (max-width: 900px)": { gridTemplateColumns: "minmax(0, 1fr)" },
    },
    shellCollapsed: {
      gridTemplateColumns: "68px minmax(0, 1fr)",
      "@media (max-width: 900px)": { gridTemplateColumns: "minmax(0, 1fr)" },
    },
    navigationCollapsed: { gridTemplateColumns: "68px" },
    collapsedLabel: { display: "none" },
    collapsedLink: {
      gridTemplateColumns: "1fr",
      justifyItems: "center",
      paddingInline: "4px",
    },
    collapsedTitle: { justifyContent: "center", paddingInline: 0 },
    collapseButton: {
      width: "28px",
      minHeight: "28px",
      padding: 0,
      borderWidth: "1px",
      borderStyle: "solid",
      borderColor: "var(--console-rule-strong)",
      borderRadius: "6px",
      backgroundColor: "transparent",
      color: "var(--console-text-dim)",
      cursor: "pointer",
      fontFamily: "var(--console-mono)",
      fontSize: "11px",
      ":focus-visible": {
        outline: "2px solid var(--console-accent)",
        outlineOffset: "-2px",
      },
    },
    mobileSummary: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      minHeight: "44px",
      marginBottom: "7px",
      borderBottomWidth: "1px",
      borderBottomStyle: "solid",
      borderBottomColor: "var(--console-rule-strong)",
      color: "var(--console-text-muted)",
      cursor: "pointer",
      listStyle: "none",
      fontFamily: "var(--console-mono)",
      fontSize: "9px",
      fontWeight: 650,
      letterSpacing: "0.15em",
      textTransform: "uppercase",
      "::-webkit-details-marker": { display: "none" },
      ":focus-visible": {
        outline: "2px solid var(--console-accent)",
        outlineOffset: "-2px",
      },
    },
    mobileCurrent: {
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      color: "var(--console-text)",
      fontFamily: "var(--console-ui)",
      fontSize: "12px",
      fontWeight: 500,
      letterSpacing: "0",
      textTransform: "none",
    },
    mobileDisclosure: {
      marginLeft: "auto",
      color: "var(--console-accent)",
      fontSize: "16px",
      fontWeight: 500,
    },
    rail: {
      minWidth: 0,
      minHeight: 0,
      overflow: "hidden",
      padding: 0,
      borderRightWidth: "1px",
      borderRightStyle: "solid",
      borderRightColor: "var(--console-rule-strong)",
      backgroundColor: "var(--console-card-soft)",
      "@media (max-width: 900px)": { display: "none" },
    },
    navigation: {
      display: "grid",
      gridTemplateColumns: "124px minmax(0, 220px)",
      width: "100%",
      height: "100%",
      minHeight: 0,
      "@media (max-width: 900px)": { display: "none" },
    },
    areaRail: {
      display: "flex",
      minWidth: 0,
      flexDirection: "column",
      gap: "4px",
      padding: "14px 10px",
      borderRightWidth: "1px",
      borderRightStyle: "solid",
      borderRightColor: "var(--console-rule-strong)",
      backgroundColor: "var(--console-card-soft)",
    },
    areaTitle: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "4px",
      padding: "7px 0 18px 9px",
      color: "var(--console-text-muted)",
      fontFamily: "var(--console-mono)",
      fontSize: "8px",
      fontWeight: 650,
      letterSpacing: "0.17em",
      textTransform: "uppercase",
    },
    areaLink: {
      position: "relative",
      display: "grid",
      gridTemplateColumns: "22px minmax(0, 1fr)",
      alignItems: "center",
      gap: "6px",
      minHeight: "42px",
      padding: "0 8px",
      borderWidth: "1px",
      borderStyle: "solid",
      borderColor: "transparent",
      borderRadius: "7px",
      backgroundColor: "transparent",
      color: "var(--console-text-dim)",
      cursor: "pointer",
      fontFamily: "var(--console-ui)",
      fontSize: "11px",
      textAlign: "left",
      ":hover": {
        borderColor: "var(--console-rule)",
        color: "var(--console-text)",
      },
      ":disabled": { cursor: "default", opacity: 0.38 },
      ":focus-visible": {
        outline: "2px solid var(--console-accent)",
        outlineOffset: "-3px",
      },
    },
    areaActive: {
      borderColor: "var(--console-rule-strong)",
      backgroundColor: "var(--console-card)",
      color: "var(--console-text)",
    },
    ordinal: {
      color: "var(--console-text-muted)",
      fontFamily: "var(--console-mono)",
      fontSize: "9px",
      fontStyle: "normal",
      fontWeight: 600,
    },
    ordinalActive: { color: "var(--console-accent)" },

    leaf: {
      display: "grid",
      minWidth: 0,
      minHeight: 0,
      gridTemplateRows: "auto minmax(0, 1fr)",
      backgroundColor:
        "color-mix(in srgb, var(--console-card-soft) 62%, var(--console-frame))",
    },
    leafHead: {
      padding: "22px 18px 16px",
      borderBottomWidth: "1px",
      borderBottomStyle: "solid",
      borderBottomColor: "var(--console-rule)",
    },
    leafKicker: {
      color: "var(--console-accent)",
      fontFamily: "var(--console-mono)",
      fontSize: "8px",
      fontWeight: 650,
      letterSpacing: "0.16em",
      textTransform: "uppercase",
    },
    leafTitle: {
      margin: "7px 0 3px",
      color: "var(--console-text)",
      fontFamily: "var(--console-display)",
      fontSize: "24px",
      fontWeight: 500,
      lineHeight: 1,
    },
    leafDescription: {
      margin: 0,
      color: "var(--console-text-muted)",
      fontSize: "10px",
      lineHeight: 1.45,
    },
    leafScroll: {
      minHeight: 0,
      overflowY: "auto",
      overscrollBehavior: "contain",
      padding: "10px 0 24px",
    },
    leafGroup: { padding: "0 0 10px" },
    leafLabel: {
      padding: "10px 18px 6px",
      color: "var(--console-text-muted)",
      fontFamily: "var(--console-mono)",
      fontSize: "8px",
      letterSpacing: "0.14em",
      textTransform: "uppercase",
    },
    list: { listStyle: "none", margin: 0, padding: 0 },
    leafLink: {
      display: "flex",
      alignItems: "baseline",
      gap: "8px",
      width: "100%",
      minHeight: "37px",
      padding: "8px 18px",
      borderWidth: 0,
      borderLeftWidth: "2px",
      borderStyle: "solid",
      borderColor: "transparent",
      backgroundColor: "transparent",
      color: "var(--console-text-dim)",
      fontFamily: "var(--console-ui)",
      fontSize: "12px",
      textAlign: "left",
      cursor: "pointer",
      ":hover": {
        backgroundColor: "var(--console-card)",
        color: "var(--console-text)",
      },
      ":focus-visible": {
        outline: "2px solid var(--console-accent)",
        outlineOffset: "-3px",
      },
    },
    leafActive: {
      borderLeftColor: "var(--console-accent)",
      backgroundColor: "var(--console-card)",
      color: "var(--console-text)",
      fontWeight: 600,
    },
    count: {
      marginLeft: "auto",
      color: "var(--console-text-muted)",
      fontFamily: "var(--console-mono)",
      fontSize: "9px",
    },
    singleton: { color: "var(--console-text-muted)", letterSpacing: "0" },

    mobileHost: {
      display: "none",
      minWidth: 0,
      "@media (max-width: 900px)": { display: "block" },
    },
    areaFoot: { marginTop: "auto" },
    chromeHeader: {
      display: "grid",
      "@media (max-width: 900px)": {
        gridTemplateColumns: "auto minmax(0, 1fr) auto",
        gap: "8px",
        minHeight: "calc(56px + env(safe-area-inset-top))",
        padding: "env(safe-area-inset-top) 16px 0",
      },
    },
    chromeBrand: {
      display: "flex",
      "@media (max-width: 900px)": { display: "none" },
    },
    chromeLocation: {
      display: "flex",
      "@media (max-width: 900px)": {
        display: "flex",
        justifyContent: "center",
        padding: 0,
        borderWidth: 0,
      },
    },
    locationLabel: {
      display: "inline",
      "@media (max-width: 900px)": { display: "none" },
    },
    locationText: {
      fontWeight: 500,
      "@media (max-width: 900px)": { fontSize: "14px" },
    },
    chromeUtility: {
      visibility: "visible",
      "@media (max-width: 900px)": { display: "none" },
    },
    browse: {
      display: "none",
      alignItems: "center",
      gap: "7px",
      minHeight: "44px",
      padding: "0 9px",
      borderWidth: 0,
      backgroundColor: "transparent",
      color: "var(--console-text)",
      cursor: "pointer",
      fontFamily: "var(--console-mono)",
      fontWeight: 650,
      fontSize: "9px",
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      "@media (max-width: 900px)": { display: "inline-flex" },
      ":focus-visible": {
        outline: "2px solid var(--console-accent)",
        outlineOffset: "-2px",
      },
    },
    sheetOverlay: {
      position: "fixed",
      zIndex: 59,
      top: "calc(56px + env(safe-area-inset-top))",
      right: 0,
      bottom: 0,
      left: 0,
    },
    sheet: {
      position: "fixed",
      zIndex: 60,
      top: "calc(56px + env(safe-area-inset-top))",
      right: 0,
      bottom: 0,
      left: 0,
      display: "grid",
      gridTemplateRows: "minmax(0, 1fr) auto",
      padding: 0,
      borderWidth: 0,
      outline: "none",
      backgroundColor:
        "color-mix(in srgb, var(--console-frame) 96%, transparent)",
      backdropFilter: "blur(16px)",
      color: "var(--console-text)",
    },
    sheetList: {
      minHeight: 0,
      overflowY: "auto",
      overscrollBehavior: "contain",
      padding: "20px 16px",
    },
    sheetHead: {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      marginBottom: "16px",
    },
    sheetTitle: {
      margin: 0,
      fontFamily: "var(--console-display)",
      fontWeight: 500,
      fontSize: "28px",
    },
    sheetClose: {
      borderWidth: 0,
      backgroundColor: "transparent",
      color: "var(--console-accent)",
      cursor: "pointer",
      fontFamily: "var(--console-mono)",
      fontWeight: 650,
      fontSize: "10px",
      minHeight: "44px",
      padding: "0 6px",
      ":focus-visible": { outline: "2px solid var(--console-accent)" },
    },
    mobileDock: {
      display: "grid",
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      padding: "8px 8px max(8px, env(safe-area-inset-bottom))",
      borderTopWidth: "1px",
      borderTopStyle: "solid",
      borderTopColor: "var(--console-rule-strong)",
      backgroundColor: "var(--console-frame)",
    },
    dockLink: {
      minHeight: "44px",
      padding: "0 4px",
      borderWidth: 0,
      borderRadius: "7px",
      backgroundColor: "transparent",
      color: "var(--console-text-muted)",
      fontFamily: "var(--console-mono)",
      fontSize: "8px",
      fontWeight: 650,
      textTransform: "uppercase",
      cursor: "pointer",
      ":disabled": { opacity: 0.38, cursor: "default" },
      ":focus-visible": {
        outline: "2px solid var(--console-accent)",
        outlineOffset: "-2px",
      },
    },
    dockActive: {
      backgroundColor: "var(--console-card)",
      color: "var(--console-accent)",
    },
    mobileGroup: { marginBottom: "20px", scrollMarginTop: "12px" },
    mobileLabel: {
      margin: "0 0 7px",
      padding: 0,
      color: "var(--console-text-muted)",
      fontFamily: "var(--console-mono)",
      fontSize: "8px",
      letterSpacing: "0.16em",
      textTransform: "uppercase",
    },
    mobileLink: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      width: "100%",
      minHeight: "var(--console-touch)",
      padding: "0 11px",
      borderWidth: 0,
      borderBottomWidth: "1px",
      borderStyle: "solid",
      borderColor: "var(--console-rule)",
      backgroundColor: "transparent",
      color: "var(--console-text-dim)",
      cursor: "pointer",
      fontFamily: "var(--console-ui)",
      fontSize: "16px",
      textAlign: "left",
      ":hover": {
        backgroundColor: "var(--console-accent-soft)",
        color: "var(--console-text)",
      },
      ":focus-visible": {
        outline: "2px solid var(--console-accent)",
        outlineOffset: "-2px",
      },
    },
    mobileActive: {
      borderBottomColor: "transparent",
      borderRadius: "7px",
      backgroundColor: "var(--console-accent-soft)",
      color: "var(--console-text)",
      fontWeight: 550,
    },
  });

export function navigationClassName(
  hook: string,
  ...styles: stylex.StyleXStyles[]
): string {
  return `${hook} ${stylex.props(...styles).className ?? ""}`;
}
