import * as stylex from "@stylexjs/stylex";
const flow = stylex.keyframes({ to: { transform: "translateX(100%)" } });
type SaveStyle =
  | "status"
  | "error"
  | "good"
  | "saveStatus"
  | "saveError"
  | "saveGood"
  | "conflict"
  | "conflictTitle"
  | "conflictCopy"
  | "reload"
  | "wrap"
  | "stations"
  | "station"
  | "done"
  | "active"
  | "dot"
  | "doneDot"
  | "activeDot"
  | "noGit"
  | "track"
  | "flow"
  | "flowing"
  | "ref"
  | "refValue";
export const saveStyles: Record<SaveStyle, stylex.StyleXStyles> = stylex.create(
  {
    status: {
      color: "var(--console-text-dim)",
      fontSize: 13,
      overflowWrap: "anywhere",
    },
    error: {
      display: "flex",
      alignItems: "baseline",
      gap: 7,
      color: "var(--console-err)",
      "::before": {
        content: '"×"',
        fontFamily: "var(--console-mono)",
        fontWeight: 500,
      },
    },
    good: { color: "var(--console-ok)" },
    saveStatus: {
      fontFamily: "var(--console-mono)",
      fontSize: 11.5,
      marginLeft: 14,
      "@media (max-width: 640px)": {
        display: "-webkit-box",
        overflow: "hidden",
        marginLeft: 0,
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: 2,
        fontSize: 9,
        lineHeight: 1.35,
      },
    },
    saveError: {
      color: "color-mix(in srgb, var(--console-err) 70%, var(--console-frame))",
    },
    saveGood: {
      color: "color-mix(in srgb, var(--console-ok) 75%, var(--console-frame))",
    },
    conflict: {
      position: "absolute",
      right: 16,
      bottom: "calc(100% + 12px)",
      width: "min(430px, calc(100vw - 32px))",
      maxWidth: 430,
      marginInline: 0,
      padding: "12px 14px",
      border:
        "1px solid color-mix(in srgb, var(--console-warn) 45%, transparent)",
      borderRadius: 8,
      backgroundColor:
        "color-mix(in srgb, var(--console-warn) 7%, var(--console-card))",
      boxShadow: "0 12px 30px color-mix(in srgb, black 12%, transparent)",
      overflowWrap: "anywhere",
    },
    conflictTitle: {
      marginBottom: 4,
      color: "var(--console-text)",
      font: "560 16px/1.2 var(--console-display)",
      fontVariationSettings: '"SOFT" 40',
    },
    conflictCopy: {
      marginBottom: 10,
      color: "var(--console-text-dim)",
      fontSize: 12,
    },
    reload: {
      minHeight: { default: 30, "@media (max-width: 640px)": 44 },
      padding: "6px 10px",
      fontSize: 11,
    },
    wrap: {
      display: "flex",
      alignItems: "center",
      minWidth: 0,
      flexWrap: "wrap",
      gap: 8,
      marginBlock: 8,
    },
    stations: {
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
    },
    station: {
      display: "inline-flex",
      alignItems: "center",
      gap: 9,
      fontFamily: "var(--console-mono)",
      fontSize: 11,
      letterSpacing: ".06em",
      color: {
        default: "var(--console-text-muted)",
        ":is([data-climate='instrument'] *)": "var(--console-text-muted)",
      },
      whiteSpace: "nowrap",
    },
    done: {
      color: {
        default: "var(--console-text)",
        ":is([data-climate='instrument'] *)": "var(--console-text)",
      },
    },
    active: {
      color: {
        default: "var(--console-text)",
        ":is([data-climate='instrument'] *)": "var(--console-text)",
      },
    },
    dot: {
      width: 9,
      height: 9,
      borderRadius: "50%",
      borderWidth: 1.5,
      borderStyle: "solid",
      borderColor: {
        default: "var(--console-text-muted)",
        ":is([data-climate='instrument'] *)": "var(--console-text-muted)",
      },
      transitionProperty: {
        default: "background-color, border-color, box-shadow",
        "@media (prefers-reduced-motion: reduce)": "none",
      },
      transitionDuration: ".2s",
      transitionTimingFunction: "ease",
    },
    doneDot: {
      backgroundColor: "var(--console-ok)",
      borderColor: {
        default: "var(--console-ok)",
        ":is([data-climate='instrument'] *)": "var(--console-text-muted)",
      },
      boxShadow:
        "0 0 10px color-mix(in srgb, var(--console-ok) 70%, transparent)",
    },
    activeDot: {
      backgroundColor: "var(--console-warn)",
      borderColor: {
        default: "var(--console-warn)",
        ":is([data-climate='instrument'] *)": "var(--console-text-muted)",
      },
      animationName: {
        default: "console-pulse",
        "@media (prefers-reduced-motion: reduce)": "none",
      },
      animationDuration: "1.2s",
      animationTimingFunction: "ease-in-out",
      animationIterationCount: "infinite",
    },
    noGit: { fontStyle: "italic" },
    track: {
      height: 1,
      width: {
        default: 34,
        "@media (min-width: 901px)": "clamp(16px, 3vw, 40px)",
      },
      backgroundColor: {
        default: "var(--console-rule-strong)",
        ":is([data-climate='instrument'] *)": "var(--console-rule-strong)",
      },
      margin: "0 8px",
      position: "relative",
      overflow: "hidden",
      display: { default: "inline-block", "@media (max-width: 640px)": "none" },
    },
    flow: {
      position: "absolute",
      inset: 0,
      backgroundImage:
        "linear-gradient(90deg, transparent, var(--console-ok) 50%, transparent)",
      transform: "translateX(-100%)",
    },
    flowing: {
      animationName: {
        default: flow,
        "@media (prefers-reduced-motion: reduce)": "none",
      },
      animationDuration: ".9s",
      animationTimingFunction: "ease-in-out",
      animationIterationCount: "infinite",
    },
    ref: {
      fontFamily: "var(--console-mono)",
      fontSize: 11,
      color: {
        default: "var(--console-text-muted)",
        ":is([data-climate='instrument'] *)": "var(--console-text-muted)",
      },
      whiteSpace: "nowrap",
    },
    refValue: {
      color: {
        default: "var(--console-text)",
        ":is([data-climate='instrument'] *)": "var(--console-text)",
      },
      fontWeight: 500,
    },
  },
);
