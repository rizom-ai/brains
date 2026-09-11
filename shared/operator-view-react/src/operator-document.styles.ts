import * as stylex from "@stylexjs/stylex";
export const documentStyles: Record<
  "body" | "application" | "mount" | "boot",
  stylex.StyleXStyles
> = stylex.create({
  application: {
    height: "100%",
    display: { default: "flex", "::after": "none" },
    flexDirection: "column",
    backgroundColor: "var(--console-frame)",
    zIndex: { default: null, "::before": 999 },
    opacity: {
      default: null,
      "::before": { default: 0.5, ':is([data-climate="paper"] *)': 0.5 },
    },
    mixBlendMode: {
      default: null,
      "::before": {
        default: "normal",
        ':is([data-climate="paper"] *)': "normal",
      },
    },
    backgroundImage: {
      default: null,
      "::before":
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='linear' slope='0.035'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E\" )",
    },
  },
  mount: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" },
  boot: {
    fontFamily: "var(--console-mono)",
    fontSize: 12,
    letterSpacing: ".14em",
    textTransform: "uppercase",
    color: "var(--console-text-muted)",
    padding: 48,
  },
  body: {
    minHeight: "100%",
    maxWidth: "100%",
    margin: 0,
    padding: 0,
    boxSizing: "border-box",
    fontFamily: "var(--console-ui)",
    fontSize: 14,
    lineHeight: 1.5,
    backgroundColor: "var(--console-bg)",
    color: "var(--console-text)",
    WebkitFontSmoothing: "antialiased",
    overflowX: "clip",
    position: {
      default: "relative",
      "::before": "fixed",
      "::after": "fixed",
    },
    content: { default: null, "::before": '""', "::after": '""' },
    inset: { default: null, "::before": 0, "::after": 0 },
    pointerEvents: { default: null, "::before": "none", "::after": "none" },
    zIndex: { default: null, "::before": 0, "::after": 0 },
    opacity: {
      default: null,
      "::before": { default: 0.035, ':is([data-climate="paper"] *)': 0.06 },
      "::after": { default: 0.55, ':is([data-climate="paper"] *)': 0.7 },
    },
    mixBlendMode: {
      default: null,
      "::before": {
        default: "overlay",
        ':is([data-climate="paper"] *)': "multiply",
      },
    },
    backgroundImage: {
      default: null,
      "::before":
        "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
      "::after": {
        default:
          "radial-gradient(ellipse at 50% 0%, transparent 0%, transparent 45%, var(--console-bg-deep) 110%)",
        ':is([data-climate="paper"] *)':
          "radial-gradient(ellipse at 50% -10%, rgba(255, 250, 235, 0.6) 0%, transparent 40%, var(--console-bg-deep) 115%)",
      },
    },
  },
});
