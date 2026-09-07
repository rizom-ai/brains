import * as stylex from "@stylexjs/stylex";

type ChromeStyle =
  | "header"
  | "brand"
  | "studio"
  | "mark"
  | "slash"
  | "location"
  | "locationText"
  | "tools"
  | "command"
  | "key"
  | "climate"
  | "identity"
  | "identityBadge"
  | "identityCurrent"
  | "menu"
  | "name"
  | "role"
  | "arrow";

/** Single-shell chrome, compiled with the Studio assets; no injected stylesheet. */
export const chromeStyles: Record<ChromeStyle, stylex.StyleXStyles> =
  stylex.create({
    header: {
      position: "relative",
      zIndex: 40,
      display: "grid",
      flex: "0 0 auto",
      gridTemplateColumns: "auto minmax(140px, 1fr) auto",
      alignItems: "center",
      gap: "28px",
      minHeight: "56px",
      padding: "0 18px",
      borderBottomWidth: "1px",
      borderBottomStyle: "solid",
      borderBottomColor: "var(--console-rule-strong)",
      backgroundColor: "var(--console-frame)",
      "@media (max-width: 900px)": {
        gridTemplateColumns: "auto minmax(0, 1fr) auto",
        gap: "8px",
        minHeight: "calc(56px + env(safe-area-inset-top))",
        padding: "env(safe-area-inset-top) 16px 0",
      },
      "@media (max-width: 640px)": { position: "sticky", top: 0 },
    },
    brand: {
      display: "flex",
      alignItems: "center",
      gap: "9px",
      minWidth: 0,
      color: "var(--console-text)",
      fontFamily: "var(--console-mono)",
      fontSize: "10px",
      letterSpacing: "0.13em",
      textDecoration: "none",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
      "@media (max-width: 900px)": { display: "none" },
    },
    studio: { font: "inherit", fontWeight: 650 },
    mark: {
      display: "grid",
      width: "28px",
      height: "28px",
      placeItems: "center",
      borderWidth: "1px",
      borderStyle: "solid",
      borderColor: "var(--console-accent)",
      borderRadius: "50%",
      color: "var(--console-accent)",
      fontFamily: "var(--console-display)",
      fontSize: "12px",
      fontWeight: 400,
      letterSpacing: 0,
    },
    slash: { color: "var(--console-text-faint)" },
    location: {
      display: "flex",
      minWidth: 0,
      alignItems: "baseline",
      gap: "9px",
      paddingLeft: "28px",
      borderLeftWidth: "1px",
      borderLeftStyle: "solid",
      borderLeftColor: "var(--console-rule-strong)",
      "@media (max-width: 900px)": {
        justifyContent: "center",
        padding: 0,
        borderWidth: 0,
      },
    },
    locationText: {
      minWidth: 0,
      overflow: "hidden",
      color: "var(--console-text)",
      fontFamily: "var(--console-ui)",
      fontSize: "12px",
      fontWeight: 400,
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      padding: 0,
      borderWidth: 0,
      backgroundColor: "transparent",
      cursor: "default",
      ":is(button)": { cursor: "pointer" },
      ":is(button):hover": { color: "var(--console-accent-dim)" },
      ":focus-visible": {
        outline: "2px solid var(--console-accent)",
        outlineOffset: "2px",
      },
    },
    tools: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      "@media (max-width: 640px)": { gap: "2px" },
    },
    command: {
      display: "inline-flex",
      minWidth: "230px",
      minHeight: "36px",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "8px",
      padding: "0 9px 0 12px",
      borderWidth: "1px",
      borderStyle: "solid",
      borderColor: "var(--console-rule-strong)",
      borderRadius: "7px",
      backgroundColor:
        "color-mix(in srgb, var(--console-card) 62%, transparent)",
      color: "var(--console-text-muted)",
      cursor: "pointer",
      fontFamily: "var(--console-ui)",
      fontSize: "12px",
      ":hover": {
        backgroundColor: "var(--console-rule)",
        color: "var(--console-text)",
      },
      ":focus-visible": {
        outline: "2px solid var(--console-accent)",
        outlineOffset: "2px",
      },
      "@media (max-width: 900px)": { display: "none" },
    },
    key: {
      padding: "1px 5px",
      borderWidth: "1px",
      borderStyle: "solid",
      borderColor: "var(--console-rule-strong)",
      borderBottomWidth: "2px",
      borderRadius: "4px",
      color: "var(--console-text-dim)",
      fontFamily: "var(--console-mono)",
      fontSize: "9px",
    },
    climate: {
      display: "inline-grid",
      width: "36px",
      minHeight: "36px",
      flex: "0 0 auto",
      placeItems: "center",
      padding: 0,
      borderWidth: "1px",
      borderStyle: "solid",
      borderColor: "var(--console-rule-strong)",
      borderRadius: "7px",
      backgroundColor: "transparent",
      color: "var(--console-text-muted)",
      cursor: "pointer",
      fontFamily: "var(--console-mono)",
      fontSize: "15px",
      ":hover": {
        backgroundColor: "var(--console-rule)",
        color: "var(--console-text)",
      },
      ":focus-visible": {
        outline: "2px solid var(--console-accent)",
        outlineOffset: "2px",
      },
      "@media (max-width: 900px)": { display: "none" },
    },
    identity: {
      display: "grid",
      width: "44px",
      height: "44px",
      placeItems: "center",
      padding: 0,
      borderWidth: 0,
      borderRadius: "50%",
      backgroundColor: "transparent",
      color: "var(--console-text)",
      cursor: "pointer",
      fontFamily: "var(--console-mono)",
      fontSize: "10px",
      fontWeight: 400,
      ":focus-visible": {
        outline: "2px solid var(--console-accent)",
        outlineOffset: "2px",
      },
    },
    identityBadge: {
      display: "grid",
      width: "32px",
      height: "32px",
      placeItems: "center",
      borderWidth: "1px",
      borderStyle: "solid",
      borderColor: "var(--console-rule-strong)",
      borderRadius: "50%",
      ":hover": { borderColor: "var(--console-accent)" },
    },
    identityCurrent: { borderColor: "var(--console-accent)" },
    menu: { width: "234px", maxWidth: "calc(100vw - 32px)" },
    name: {
      display: "block",
      color: "var(--console-text)",
      fontFamily: "var(--console-display)",
      fontSize: "14px",
      fontVariationSettings: '"SOFT" 55',
      fontWeight: 580,
    },
    role: {
      display: "block",
      marginTop: "3px",
      color: "var(--console-text-muted)",
      fontFamily: "var(--console-mono)",
      fontSize: "8px",
      letterSpacing: "0.1em",
      textTransform: "uppercase",
    },
    arrow: { marginLeft: "auto" },
  });
