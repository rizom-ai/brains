import * as stylex from "@stylexjs/stylex";
export const chatLayout: Record<
  | "root"
  | "shell"
  | "frame"
  | "room"
  | "sessions"
  | "picker"
  | "thread"
  | "threadHead"
  | "sessionList"
  | "session"
  | "activeSession"
  | "sessionTitle"
  | "timestamp"
  | "actions"
  | "title"
  | "summary"
  | "context"
  | "contextBody"
  | "contextItem"
  | "threadScroll"
  | "manuscript"
  | "turn"
  | "speaker"
  | "turnBody"
  | "userBody"
  | "paragraph"
  | "cards"
  | "card"
  | "kicker"
  | "empty"
  | "error"
  | "form"
  | "composer"
  | "fieldLabel"
  | "input"
  | "uploadInput"
  | "attachButton"
  | "uploadList"
  | "upload"
  | "headCopy"
  | "subheading"
  | "button"
  | "primaryButton"
  | "cardHeading"
  | "cardText",
  stylex.StyleXStyles
> = stylex.create({
  shell: {
    display: "grid",
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
  },
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100dvh",
    maxHeight: "100dvh",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
  },
  frame: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
    padding: {
      default: "36px 36px 38px",
      "@media (max-width: 640px)":
        "24px 20px calc(24px + env(safe-area-inset-bottom))",
    },
    gap: 28,
  },
  room: {
    display: "grid",
    gridTemplateColumns: {
      default: "180px minmax(0,1fr)",
      "@media (max-width: 860px)": "minmax(0,1fr)",
    },
    gap: 32,
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
  },
  sessions: {
    display: { default: "block", "@media (max-width: 860px)": "none" },
    minWidth: 0,
    minHeight: 0,
    overflowY: "auto",
  },
  picker: {
    display: "grid",
    gridTemplateRows: "auto minmax(0,1fr)",
    maxHeight: "65dvh",
    minHeight: 0,
    overflow: "hidden",
  },
  thread: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
  },
  threadHead: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 20,
    minWidth: 0,
    marginBottom: 22,
  },
  title: {
    margin: 0,
    fontFamily: "var(--console-display)",
    fontSize: 24,
    fontVariationSettings: '"SOFT" 70,"opsz" 40',
    fontWeight: 400,
    lineHeight: 1.3,
    overflowWrap: "anywhere",
    color: "var(--console-text)",
  },
  headCopy: { minWidth: 0, flex: 1 },
  actions: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 },
  sessionList: {
    display: "grid",
    alignContent: "start",
    minHeight: 0,
    minWidth: 0,
    overflowY: "auto",
  },
  session: {
    display: "grid",
    gap: 6,
    width: "100%",
    minWidth: 0,
    padding: "16px 0",
    borderWidth: 0,
    borderBottomWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule)",
    backgroundColor: "transparent",
    color: "var(--console-text)",
    textAlign: "left",
    cursor: "pointer",
    ":hover": { color: "var(--console-accent)" },
    ":focus-visible": {
      outline: "2px solid var(--console-accent)",
      outlineOffset: -2,
    },
  },
  activeSession: { color: "var(--console-accent)" },
  sessionTitle: {
    fontFamily: "var(--console-ui)",
    fontSize: 14,
    fontWeight: 400,
    lineHeight: 1.45,
    overflowWrap: "anywhere",
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    overflow: "hidden",
  },
  timestamp: {
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    lineHeight: 1.7,
    color: "var(--console-text-muted)",
    overflowWrap: "anywhere",
  },
  summary: {
    minHeight: 32,
    paddingBottom: 12,
    fontFamily: "var(--console-ui)",
    fontSize: 12,
    color: "var(--console-text-muted)",
    cursor: "pointer",
  },
  context: {
    minWidth: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule)",
  },
  contextBody: {
    display: "grid",
    gap: 16,
    maxHeight: {
      default: "min(240px, 28dvh)",
      "@media (max-width: 860px)": "min(200px, 20dvh)",
    },
    overflowY: "auto",
    paddingBottom: 16,
    minWidth: 0,
  },
  contextItem: {
    display: "grid",
    gap: 6,
    minWidth: 0,
    padding: "10px 0",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule)",
    fontFamily: "var(--console-ui)",
    fontSize: 12,
    lineHeight: 1.6,
  },
  threadScroll: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    scrollbarWidth: "thin",
    scrollbarColor: "var(--console-rule-strong) transparent",
  },
  manuscript: { minWidth: 0 },
  turn: {
    display: "grid",
    gridTemplateColumns: {
      default: "40px minmax(0,1fr)",
      "@media (max-width: 640px)": "28px minmax(0,1fr)",
    },
    gap: 16,
    padding: "24px 8px 24px 0",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule)",
    minWidth: 0,
  },
  speaker: {
    paddingTop: 6,
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    lineHeight: 1.6,
    color: "var(--console-text-muted)",
  },
  turnBody: {
    display: "grid",
    gap: 12,
    minWidth: 0,
    fontFamily: "var(--console-display)",
    fontSize: 18,
    fontWeight: 400,
    lineHeight: 1.65,
    color: "var(--console-text)",
    overflowWrap: "anywhere",
  },
  userBody: { fontWeight: 600 },
  paragraph: { margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  cards: { display: "grid", gap: 12, minWidth: 0 },
  card: {
    display: "grid",
    gap: 10,
    minWidth: 0,
    padding: 16,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule)",
    borderRadius: 5,
    fontFamily: "var(--console-ui)",
    fontSize: 12,
    fontWeight: 400,
    lineHeight: 1.6,
    overflowWrap: "anywhere",
    overflowX: "auto",
  },
  kicker: {
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    color: "var(--console-text-muted)",
  },
  cardHeading: { margin: 0, fontSize: 14, fontWeight: 600 },
  cardText: {
    margin: 0,
    fontFamily: "var(--console-ui)",
    fontSize: 12,
    lineHeight: 1.6,
  },
  empty: {
    margin: "16px 0",
    fontFamily: "var(--console-ui)",
    fontSize: 12,
    lineHeight: 1.6,
    color: "var(--console-text-muted)",
    overflowWrap: "anywhere",
  },
  error: { color: "var(--console-err)" },
  form: { display: "grid", gap: 12, minWidth: 0 },
  composer: {
    flexShrink: 0,
    minWidth: 0,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--console-rule)",
  },
  fieldLabel: {
    display: "grid",
    gap: 8,
    fontFamily: "var(--console-ui)",
    fontSize: 12,
    color: "var(--console-text)",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    minWidth: 0,
    minHeight: 80,
    maxHeight: 180,
    resize: "vertical",
    padding: 12,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule)",
    borderRadius: 5,
    backgroundColor: "transparent",
    fontFamily: "var(--console-ui)",
    fontSize: 14,
    lineHeight: 1.5,
    color: "var(--console-text)",
    ":focus-visible": {
      outline: "2px solid var(--console-accent)",
      outlineOffset: 2,
    },
  },
  attachButton: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 40,
    padding: "8px 12px",
    boxSizing: "border-box",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule)",
    borderRadius: 5,
    fontFamily: "var(--console-ui)",
    fontSize: 12,
    color: "var(--console-text)",
    cursor: "pointer",
    ":focus-within": {
      outline: "2px solid var(--console-accent)",
      outlineOffset: 2,
    },
  },
  uploadInput: {
    position: "absolute",
    width: 1,
    height: 1,
    clipPath: "inset(50%)",
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
  uploadList: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  upload: {
    display: "inline-block",
    margin: 0,
    maxWidth: "100%",
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    fontWeight: 400,
    color: "var(--console-text-muted)",
    overflowWrap: "anywhere",
  },
  button: {
    minHeight: 40,
    padding: "8px 12px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule)",
    borderRadius: 5,
    backgroundColor: "transparent",
    color: "var(--console-text)",
    fontFamily: "var(--console-ui)",
    fontSize: 12,
    cursor: "pointer",
    ":focus-visible": {
      outline: "2px solid var(--console-accent)",
      outlineOffset: 2,
    },
    ":disabled": { opacity: 0.5, cursor: "default" },
  },
  primaryButton: {
    backgroundColor: "var(--console-accent)",
    borderColor: "var(--console-accent)",
    color: "var(--console-frame)",
  },
  subheading: {
    margin: 0,
    fontFamily: "var(--console-ui)",
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.5,
  },
});
export function chatClass(
  name: string,
  ...styles: stylex.StyleXStyles[]
): string {
  return `${name} ${stylex.props(...styles).className ?? ""}`;
}
