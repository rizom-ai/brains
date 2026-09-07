import * as stylex from "@stylexjs/stylex";
export const chatLayout: Record<
  | "imageTrigger"
  | "fullImage"
  | "toolbar"
  | "toolbarButton"
  | "details"
  | "composerBar"
  | "userTurn"
  | "source"
  | "uploadStrip"
  | "uploadPreview"
  | "uploadName"
  | "root"
  | "shell"
  | "frame"
  | "room"
  | "emptyConversation"
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
  | "attachmentPreview"
  | "kicker"
  | "empty"
  | "error"
  | "form"
  | "composer"
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
  imageTrigger: {
    display: "block",
    width: "100%",
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    cursor: "zoom-in",
    minHeight: 44,
    ":focus-visible": {
      outline: "2px solid var(--console-accent)",
      outlineOffset: 2,
    },
  },
  fullImage: {
    width: "100%",
    height: "auto",
    maxHeight: "60dvh",
    objectFit: "contain",
  },
  toolbar: { display: "flex", alignItems: "center", gap: 2, flexShrink: 0 },
  toolbarButton: {
    minHeight: 44,
    minWidth: 44,
    padding: "8px 10px",
    fontSize: 12,
  },
  details: { display: "grid", gap: 16, minWidth: 0 },
  composerBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  userTurn: {
    marginLeft: "auto",
    maxWidth: "min(580px, 100%)",
    backgroundColor: "var(--console-card-soft)",
    borderRadius: "12px 12px 2px 12px",
    padding: "14px 16px",
  },
  source: {
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    overflow: "auto",
    maxHeight: "min(40dvh, 320px)",
    padding: 12,
    margin: 0,
    fontFamily: "var(--console-mono)",
    fontSize: 12,
    lineHeight: 1.6,
    backgroundColor: "var(--console-card-soft)",
  },
  uploadStrip: {
    display: "flex",
    overflowX: "auto",
    maxHeight: 100,
    gap: 8,
    minWidth: 0,
    scrollbarWidth: "thin",
    marginBottom: 6,
  },
  uploadPreview: { width: 40, height: 40, objectFit: "cover", borderRadius: 4 },
  uploadName: { minWidth: 0, flex: 1, overflowWrap: "anywhere", fontSize: 12 },
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
    display: { default: "block", "@media (max-width: 640px)": "none" },
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
    padding: 0,
    gap: 0,
  },
  room: {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr)",
    gap: 0,
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
  },
  emptyConversation: { margin: 0 },
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
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minWidth: 0,
    flexShrink: 0,
    minHeight: 54,
    padding: { default: "4px 24px", "@media (max-width: 640px)": "4px 10px" },
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule)",
    marginBottom: 0,
  },
  title: {
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
    fontFamily: "var(--console-ui)",
    fontSize: 13,
    fontWeight: 400,
    lineHeight: 1.5,
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
    maxHeight: "min(480px, 60dvh)",
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
  manuscript: {
    minWidth: 0,
    maxWidth: 740,
    marginInline: "auto",
    padding: { default: "26px 24px", "@media (max-width: 640px)": "18px 16px" },
  },
  turn: {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr)",
    gap: 8,
    padding: 0,
    marginBottom: 26,
    minWidth: 0,
  },
  speaker: {
    paddingTop: 0,
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    lineHeight: 1.6,
    color: "var(--console-text-muted)",
  },
  turnBody: {
    display: "grid",
    gap: 12,
    minWidth: 0,
    fontFamily: "var(--console-ui)",
    fontSize: { default: 16, "@media (max-width: 640px)": 15 },
    fontWeight: 400,
    lineHeight: 1.65,
    color: "var(--console-text)",
    overflowWrap: "anywhere",
  },
  userBody: { fontWeight: 400 },
  paragraph: { margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  cards: { display: "grid", gap: 12, minWidth: 0 },
  attachmentPreview: {
    display: "block",
    width: "100%",
    maxWidth: "100%",
    height: "auto",
    maxHeight: 260,
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
    color: "var(--console-text-dim)",
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
    color: "var(--console-text-dim)",
    overflowWrap: "anywhere",
  },
  error: { color: "var(--console-err)" },
  form: {
    display: "grid",
    gap: 4,
    minWidth: 0,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule-strong)",
    borderRadius: 12,
    padding: "8px 10px",
    backgroundColor: "var(--console-card)",
  },
  composer: {
    flexShrink: 0,
    minWidth: 0,
    width: "100%",
    maxWidth: 740,
    alignSelf: "center",
    padding: {
      default: "10px 24px 16px",
      "@media (max-width: 640px)":
        "8px 10px calc(10px + env(safe-area-inset-bottom))",
    },
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    minWidth: 0,
    height: 44,
    minHeight: 44,
    maxHeight: 140,
    resize: "none",
    padding: 5,
    borderWidth: 0,
    borderStyle: "solid",
    borderColor: "var(--console-rule)",
    borderRadius: 5,
    backgroundColor: "transparent",
    fontFamily: "var(--console-ui)",
    fontSize: 16,
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
    flexWrap: "nowrap",
    flexShrink: 0,
    gap: 8,
    margin: 0,
    padding: 0,
    listStyleType: "none",
  },
  upload: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    margin: 0,
    maxWidth: 280,
    fontFamily: "var(--console-mono)",
    fontSize: 11,
    fontWeight: 400,
    color: "var(--console-text-muted)",
    overflowWrap: "anywhere",
  },
  button: {
    minHeight: 44,
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
