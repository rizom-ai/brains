import * as stylex from "@stylexjs/stylex";
export const chatLayout: Record<
  | "root"
  | "shell"
  | "frame"
  | "room"
  | "roomWithoutSessions"
  | "emptyThreadHead"
  | "emptyConversation"
  | "sessions"
  | "mobileSessions"
  | "picker"
  | "thread"
  | "threadHead"
  | "sessionList"
  | "session"
  | "activeSession"
  | "sessionTitle"
  | "sessionControls"
  | "sessionFilterSelect"
  | "timestamp"
  | "actions"
  | "title"
  | "summary"
  | "context"
  | "desktopContext"
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
  | "attachmentPreview"
  | "kicker"
  | "empty"
  | "error"
  | "form"
  | "composer"
  | "fieldLabel"
  | "composerHint"
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
  sessionControls: {
    display: "grid",
    gap: 8,
    minWidth: 0,
    marginBottom: 12,
    fontSize: 12,
    color: "var(--console-text-muted)",
  },
  // The index is a narrow column: its controls stay one field tall each and
  // carry their own labels, so the list starts near the top of the rail.
  sessionFilterSelect: {
    width: "100%",
    minWidth: 0,
    minHeight: { default: 38, "@media (max-width: 640px)": 44 },
    fontSize: { default: 13, "@media (max-width: 640px)": 16 },
  },
  composerHint: {
    display: "block",
    marginTop: 8,
    fontSize: 11,
    lineHeight: 1.4,
    color: "var(--console-text-muted)",
  },
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
    paddingBottom: {
      default: 38,
      "@media (max-width: 640px)": "calc(24px + env(safe-area-inset-bottom))",
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
  roomWithoutSessions: { gridTemplateColumns: "minmax(0,1fr)" },
  emptyThreadHead: { marginBottom: 12 },
  emptyConversation: { margin: 0 },
  mobileSessions: {
    display: { default: "none", "@media (max-width: 860px)": "inline-flex" },
  },
  sessions: {
    display: { default: "block", "@media (max-width: 860px)": "none" },
    minWidth: 0,
    minHeight: 0,
    overflowY: "auto",
  },
  picker: {
    "--console-text-muted":
      "color-mix(in srgb, var(--color-text-light) 70%, var(--color-text))",
    display: "grid",
    gridTemplateRows: "auto auto minmax(0,1fr)",
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
  desktopContext: {
    display: { default: "block", "@media (max-width: 860px)": "none" },
  },
  context: {
    minWidth: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule)",
  },
  contextBody: {
    display: "grid",
    outline: {
      default: null,
      ":focus-visible": "2px solid var(--console-accent)",
    },
    outlineOffset: -2,
    gap: 16,
    maxHeight: {
      default: "min(240px, 28dvh)",
      "@media (max-width: 860px)": "min(480px, 60dvh)",
    },
    overflowY: "auto",
    paddingBottom: 16,
    paddingInline: 4,
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
    outline: {
      default: null,
      ":focus-visible": "2px solid var(--console-accent)",
    },
    outlineOffset: -2,
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
  attachmentPreview: {
    display: "block",
    width: "100%",
    maxWidth: "100%",
    height: "auto",
    maxHeight: 480,
    objectFit: "contain",
    backgroundColor: "var(--console-card)",
  },
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
  cardHeading: { margin: 0 },
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
    minHeight: {
      default: 40,
      "@media (max-width: 640px)": "var(--console-touch)",
    },
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
  uploadList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    margin: "0 0 12px",
    padding: 0,
    listStyleType: "none",
  },
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
    lineHeight: 1.5,
  },
});
export function chatClass(
  name: string,
  ...styles: stylex.StyleXStyles[]
): string {
  return `${name} ${stylex.props(...styles).className ?? ""}`;
}
