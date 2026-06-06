import { getActiveAuthService } from "@brains/auth-service";
import {
  MessageInterfacePlugin,
  coerceConversationMetadata,
  type EditMessageRequest,
  type InterfacePluginContext,
  type JobContext,
  type JobProgressEvent,
  type SendMessageToChannelRequest,
  type SendMessageWithIdRequest,
  type StructuredChatCard,
  type WebRouteDefinition,
  type ChatAttachment,
  type ToolActivityEvent,
} from "@brains/plugins";
import { z } from "@brains/utils";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageStreamWriter,
} from "ai";
import { basename, dirname, join } from "path";
import packageJson from "../package.json";
import { webChatConfigSchema, type WebChatConfig } from "./config";
import { stripInternalEntityMemoryNote } from "./display-content";
import {
  WebChatUploadStore,
  WebChatUploadStoreError,
  webChatUploadIdPattern,
  webChatUploadRefKind,
  type ResolvedWebChatUpload,
  type WebChatUploadRecord,
} from "./upload-store";
import {
  defaultWebChatUploadFilename,
  sanitizeUploadFilename,
  validateWebChatUpload,
  webChatUploadMaxBytes,
  type ValidatedWebChatUpload,
} from "./upload-policy";

const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const filePartSchema = z.object({
  type: z.literal("file"),
  mediaType: z.string().optional(),
  filename: z.string().optional(),
  url: z.string(),
});

const approvalResponsePartSchema = z
  .object({
    state: z.literal("approval-responded"),
    approval: z.object({
      id: z.string(),
      approved: z.boolean(),
    }),
  })
  .passthrough();

const uiMessageSchema = z.object({
  role: z.string(),
  parts: z.array(z.unknown()).optional(),
  content: z.string().optional(),
});

const chatRequestSchema = z.object({
  id: z.string().optional(),
  messages: z.array(uiMessageSchema).min(1),
  trigger: z.string().optional(),
});

const webChatInterfaceType = "web-chat";
const webChatSessionLimit = 25;
const webChatTitleMessageLimit = 6;
const webChatTitleMaxLength = 48;
const webChatUploadFormField = "file";
/* Extra slack over the text-file size limit to cover the multipart envelope
   (boundary, headers) when guarding on Content-Length before buffering. */
const webChatUploadEnvelopeSlackBytes = 16_384;

const uploadRefSchema = z.object({
  kind: z.literal(webChatUploadRefKind),
  id: z.string().regex(webChatUploadIdPattern),
});

const uploadRefPartSchema = z.object({
  type: z.literal("data-upload"),
  data: z.object({
    ref: uploadRefSchema,
  }),
});

const renameSessionRequestSchema = z.object({
  title: z.string().trim().min(1).max(webChatTitleMaxLength),
});

type ChatRequest = z.infer<typeof chatRequestSchema>;
type ApprovalResponse = z.infer<typeof approvalResponsePartSchema>["approval"];
type WebChatConversation = NonNullable<
  Awaited<ReturnType<InterfacePluginContext["conversations"]["get"]>>
>;

interface WebChatProgressData {
  type: JobProgressEvent["type"];
  status: JobProgressEvent["status"];
  operationType: JobContext["operationType"];
  operationTarget?: string;
  message?: string;
  progress?: JobProgressEvent["progress"];
}

interface WebChatToolStatusData {
  status: "tool-invoking" | "tool-completed" | "tool-failed";
  toolName: string;
  message: string;
  error?: string;
}

interface ParsedUserInput {
  message: string;
  attachments: ChatAttachment[];
  responseText?: string;
}

type DeferredUploadIntent = "image" | "pdf" | "upload";

const storedChatAttachmentSchema = z.object({
  kind: z.literal("text"),
  filename: z.string().min(1),
  mediaType: z.string().min(1),
  sizeBytes: z.number().nonnegative().optional(),
  source: z
    .object({
      kind: z.string().min(1),
      id: z.string().min(1),
    })
    .optional(),
});

const storedChatAttachmentsSchema = z.array(storedChatAttachmentSchema);

const storedAttachmentCardSchema = z.object({
  kind: z.literal("attachment"),
  id: z.string().min(1),
  jobId: z.string().min(1).optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  attachment: z.object({
    mediaType: z.string().min(1),
    url: z.string().min(1),
    downloadUrl: z.string().min(1).optional(),
    previewUrl: z.string().min(1).optional(),
    filename: z.string().min(1).optional(),
    sizeBytes: z.number().nonnegative().optional(),
    source: z
      .object({
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        attachmentType: z.string().optional(),
      })
      .optional(),
  }),
});
const storedChatCardsSchema = z.array(storedAttachmentCardSchema);

const uiAssetPath = "/chat/assets/app.js";
const uiAssetFile = join(import.meta.dir, "..", "dist", "ui", "app.js");
/* Rizom-flavored chat styling. Mirrors interfaces/web-chat/mockup.html;
   keep both in sync if you iterate on either. */
const chatPageStyles = `
/* ─── Chat tokens — alias chain pattern matching plugins/dashboard.
   Each --chat-* falls back through:
     dashboard token (if embedded in a dashboard) →
     site theme token (if loaded inside a site bundle) →
     hex literal (when served standalone, e.g. /chat).
   Components reference only --chat-*, so swapping the page context
   reskins the chat without touching component rules. ─── */
:root {
  --chat-bg:           var(--dashboard-bg, var(--color-bg, #0d0a1a));
  --chat-bg-subtle:    var(--dashboard-card-soft, var(--color-bg-subtle, #0e0b1e));
  --chat-bg-card:      var(--dashboard-card, var(--color-bg-card, #1a0a3e));
  --chat-text:         var(--dashboard-text, var(--color-text, #ffffff));
  --chat-text-muted:   var(--dashboard-text-dim, var(--color-text-muted, rgb(255 255 255 / 0.6)));
  --chat-text-light:   var(--dashboard-text-muted, var(--color-text-light, rgb(255 255 255 / 0.4)));
  --chat-accent:       var(--dashboard-accent, var(--color-accent, #ffa366));
  --chat-accent-dark:  var(--color-accent-dark, #e87722);
  --chat-secondary:    var(--color-secondary, #818cf8);
  --chat-on-accent:    var(--color-on-accent, #0d0a1a);
  --chat-border:       var(--rule-strong, var(--color-border, rgb(255 255 255 / 0.1)));
  --chat-border-soft:  var(--rule, var(--color-border-light, rgb(255 255 255 / 0.04)));
  --chat-success:      var(--dashboard-success, var(--color-success, #4ade80));
  --chat-error:        var(--dashboard-error, var(--color-error, #f87171));

  /* Inset tints applied on top of the page bg. Dark mode = white at low
     alpha; light mode (below) flips to dark-on-light. */
  --chat-surface-soft: rgb(255 255 255 / 0.04);
  --chat-surface:      rgb(255 255 255 / 0.08);
  --chat-surface-inset: rgb(0 0 0 / 0.25);
  --chat-surface-deep:  rgb(0 0 0 / 0.35);

  --chat-glow-cta:        rgb(255 163 102 / 0.3);
  --chat-glow-cta-strong: rgb(255 163 102 / 0.45);

  --chat-font-display: var(--dashboard-font-display, var(--font-display, Georgia, "Times New Roman", serif));
  --chat-font-body:    var(--dashboard-font-body, var(--font-body, system-ui, -apple-system, "Segoe UI", sans-serif));
  --chat-font-label:   var(--dashboard-font-mono, var(--font-label, ui-monospace, SFMono-Regular, Menlo, monospace));

  --chat-bg-noise: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
  --chat-bg-ember: radial-gradient(ellipse at 18% -10%, rgb(255 163 102 / 0.08) 0%, transparent 55%),
                   radial-gradient(ellipse at 90% 110%, rgb(140 130 200 / 0.06) 0%, transparent 45%);

  color-scheme: dark;
}

/* ─── Light mode — toggled by [data-theme="light"] on <html>, matching
   the theme convention used by Rizom site + dashboard. Fallback chain
   still applies; only standalone hex defaults differ. ─── */
[data-theme="light"] {
  --chat-bg:           var(--dashboard-bg, var(--color-bg, #f2eee8));
  --chat-bg-subtle:    var(--dashboard-card-soft, var(--color-bg-subtle, #eae5dd));
  --chat-bg-card:      var(--dashboard-card, var(--color-bg-card, #f0ece5));
  --chat-text:         var(--dashboard-text, var(--color-text, #1a1625));
  --chat-text-muted:   var(--dashboard-text-dim, var(--color-text-muted, rgb(26 22 37 / 0.6)));
  --chat-text-light:   var(--dashboard-text-muted, var(--color-text-light, rgb(26 22 37 / 0.4)));
  --chat-accent:       var(--dashboard-accent, var(--color-accent, #c45a08));
  --chat-accent-dark:  var(--color-accent-dark, #8b3a05);
  --chat-secondary:    var(--color-secondary, #6b2fa0);
  --chat-on-accent:    var(--color-on-accent, #ffffff);
  --chat-border:       var(--rule-strong, var(--color-border, rgb(26 22 37 / 0.12)));
  --chat-border-soft:  var(--rule, var(--color-border-light, rgb(26 22 37 / 0.05)));
  --chat-success:      var(--dashboard-success, var(--color-success, #15803d));
  --chat-error:        var(--dashboard-error, var(--color-error, #b91c1c));

  --chat-surface-soft: rgb(26 22 37 / 0.04);
  --chat-surface:      rgb(26 22 37 / 0.08);
  --chat-surface-inset: rgb(26 22 37 / 0.05);
  --chat-surface-deep:  rgb(26 22 37 / 0.08);

  --chat-glow-cta:        rgb(196 90 8 / 0.22);
  --chat-glow-cta-strong: rgb(196 90 8 / 0.35);

  --chat-bg-noise: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E");
  --chat-bg-ember: radial-gradient(ellipse at 18% -10%, rgb(232 119 34 / 0.1) 0%, transparent 55%),
                   radial-gradient(ellipse at 90% 110%, rgb(107 47 160 / 0.08) 0%, transparent 45%);

  color-scheme: light;
}

* { box-sizing: border-box; }
html, body, #root { height: 100%; }
body {
  margin: 0;
  background-color: var(--chat-bg);
  background-image: var(--chat-bg-ember), var(--chat-bg-noise);
  color: var(--chat-text);
  font-family: var(--chat-font-body);
  font-size: 16px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
#root { display: block; }
button, textarea, input { font: inherit; color: inherit; }

/* ─── Shell (sessions rail + chat surface).
   The chat IS the page, so the shell fills the viewport edge-to-edge.
   No card chrome (border / gradient bg) — the page already provides
   the noise + ember atmosphere. ─── */
.web-chat-shell {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-height: 100vh;
}
/* ─── Chat surface — flush with the sessions rail on the left, capped
   on the right. The mycelial spine runs the full height at the chat
   pane's left edge; the reading column inside it can center freely. ─── */
.web-chat-app {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  gap: 1.25rem;
  min-width: 0;
  min-height: 0;
  width: 100%;
  max-width: 96rem;
  justify-self: start;
  padding: 1.25rem 1.5rem 1.5rem 5rem;
}
/* The spine — a glowing vertical hypha that anchors the chat pane.
   Sits roughly midway in the left gutter, with breathing room on
   both sides. Fades at the ends so it reads as rooted, not boxed. */
.web-chat-app::before {
  content: "";
  position: absolute;
  left: 2.5rem;
  top: 0;
  bottom: 0;
  width: 1px;
  background: linear-gradient(180deg,
    transparent 0%,
    rgb(from var(--chat-secondary) r g b / 0.25) 6%,
    rgb(from var(--chat-secondary) r g b / 0.35) 50%,
    rgb(from var(--chat-accent) r g b / 0.25) 94%,
    transparent 100%);
  pointer-events: none;
}
/* Terminus seed — a small pulsing dot at the foot of the spine. */
.web-chat-app::after {
  content: "";
  position: absolute;
  left: calc(2.5rem - 2px);
  bottom: 1.25rem;
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--chat-accent);
  box-shadow: 0 0 12px rgb(from var(--chat-accent) r g b / 0.7);
  opacity: 0.85;
  pointer-events: none;
}
/* Header is full-width page chrome — title left, "New" button right.
   The reading column (conversation + status + error + prompt) caps at
   56rem and centers, with a shared 2.75rem left pad so their content
   aligns with the message text behind the spine gutter. */
.web-chat-app > .web-chat-conversation,
.web-chat-app > .web-chat-session-notice,
.web-chat-app > .web-chat-status,
.web-chat-app > .web-chat-error,
.web-chat-app > .web-chat-prompt-input {
  width: 100%;
  max-width: 72rem;
  margin-left: auto;
  margin-right: auto;
}

/* ── Header ── */
.web-chat-header {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: start;
  gap: 1rem;
}
.web-chat-header-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  margin-bottom: 0.5rem;
  font-family: var(--chat-font-label);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--chat-text-muted);
}
.web-chat-header-eyebrow::before {
  content: "";
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--chat-accent);
  box-shadow: 0 0 10px rgb(from var(--chat-accent) r g b / 0.7);
}
.web-chat-header-eyebrow strong {
  color: var(--chat-text);
  font-weight: 600;
}
.web-chat-header h1 {
  margin: 0;
  font-family: var(--chat-font-display);
  font-weight: 520;
  font-size: clamp(2rem, 3.4vw, 2.75rem);
  line-height: 1;
  letter-spacing: -0.025em;
}
.web-chat-header h1 em {
  font-style: italic;
  font-weight: 400;
  color: var(--chat-accent);
}
.web-chat-header p {
  margin: 0.55rem 0 0;
  color: var(--chat-text-muted);
  font-family: var(--chat-font-display);
  font-style: italic;
  font-weight: 300;
  font-size: 15px;
  line-height: 1.5;
  max-width: 36ch;
}

.web-chat-secondary-action {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 1rem;
  border: 1px solid var(--chat-border);
  border-radius: 999px;
  background: var(--chat-surface-soft);
  color: var(--chat-text);
  font-family: var(--chat-font-label);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
}
.web-chat-secondary-action:hover {
  border-color: var(--chat-text-light);
  background: var(--chat-surface);
}
.web-chat-secondary-action svg { width: 12px; height: 12px; }

/* Header actions cluster — theme toggle + New button. Sits at the
   top-right of the header; padding-top aligns it with the h1 baseline
   rather than the very top of the eyebrow. */
.web-chat-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding-top: 1.4rem;
}
.web-chat-icon-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--chat-border);
  border-radius: 50%;
  background: var(--chat-surface-soft);
  color: var(--chat-text-muted);
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease, transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.web-chat-icon-action:hover {
  border-color: var(--chat-accent);
  background: rgb(from var(--chat-accent) r g b / 0.1);
  color: var(--chat-accent);
  transform: rotate(15deg);
}
.web-chat-icon-action svg { width: 14px; height: 14px; }

/* ─── Session dialogs ─── */
.web-chat-session-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 1.25rem;
  background: rgb(0 0 0 / 0.42);
  backdrop-filter: blur(10px);
}
.web-chat-session-dialog {
  width: min(100%, 28rem);
  padding: 1.25rem;
  border: 1px solid rgb(from var(--chat-accent) r g b / 0.25);
  border-radius: 24px;
  background:
    linear-gradient(145deg, var(--chat-bg-card), var(--chat-bg-subtle)),
    var(--chat-bg-card);
  box-shadow:
    0 24px 80px rgb(0 0 0 / 0.42),
    inset 0 1px 0 rgb(255 255 255 / 0.06);
}
.web-chat-session-dialog-kicker {
  display: block;
  margin-bottom: 0.4rem;
  font-family: var(--chat-font-label);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--chat-accent);
}
.web-chat-session-dialog h2 {
  margin: 0 0 0.75rem;
  font-family: var(--chat-font-display);
  font-size: 1.45rem;
  font-weight: 520;
  letter-spacing: -0.02em;
}
.web-chat-session-dialog p {
  margin: 0;
  color: var(--chat-text-muted);
  font-size: 14px;
  line-height: 1.55;
}
.web-chat-session-dialog strong { color: var(--chat-text); }
.web-chat-session-dialog-form {
  display: grid;
  gap: 0.65rem;
}
.web-chat-session-dialog label {
  font-family: var(--chat-font-label);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--chat-text-light);
}
.web-chat-session-dialog input {
  width: 100%;
  border: 1px solid var(--chat-border);
  border-radius: 16px;
  background: var(--chat-surface-inset);
  color: var(--chat-text);
  padding: 0.75rem 0.85rem;
  outline: none;
}
.web-chat-session-dialog input:focus {
  border-color: var(--chat-accent);
  box-shadow: 0 0 0 3px rgb(from var(--chat-accent) r g b / 0.14);
}
.web-chat-session-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  margin-top: 1.1rem;
}
.web-chat-session-dialog-actions button {
  border: 1px solid var(--chat-border);
  border-radius: 999px;
  background: var(--chat-surface-soft);
  color: var(--chat-text-muted);
  cursor: pointer;
  padding: 0.55rem 0.85rem;
  font-family: var(--chat-font-label);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.web-chat-session-dialog-actions button:hover:not(:disabled) {
  border-color: var(--chat-accent);
  color: var(--chat-accent);
}
.web-chat-session-dialog-actions button[data-primary="true"] {
  border-color: rgb(from var(--chat-accent) r g b / 0.55);
  background: rgb(from var(--chat-accent) r g b / 0.14);
  color: var(--chat-accent);
}
.web-chat-session-dialog-actions button[data-danger="true"] {
  border-color: rgb(from var(--chat-error) r g b / 0.45);
  background: rgb(from var(--chat-error) r g b / 0.12);
  color: var(--chat-error);
}
.web-chat-session-dialog-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

/* ─── Sessions panel ─── */
.web-chat-sessions {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  padding: 1.25rem 0 1.5rem;
  min-height: 0;
  border-right: 1px solid var(--chat-border-soft);
}
.web-chat-sessions-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0 1.25rem 0.85rem;
}
.web-chat-sessions-header h2 {
  margin: 0;
  font-family: var(--chat-font-display);
  font-weight: 520;
  font-size: 1.05rem;
  letter-spacing: -0.01em;
  color: var(--chat-text);
}
.web-chat-sessions-header h2 em {
  font-style: italic;
  font-weight: 400;
  color: var(--chat-accent);
}
.web-chat-sessions-new {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px; height: 28px;
  border: 1px solid var(--chat-border);
  border-radius: 50%;
  background: rgb(from var(--chat-accent) r g b / 0.1);
  color: var(--chat-accent);
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease, border-color 0.2s ease;
}
.web-chat-sessions-new:hover {
  background: rgb(from var(--chat-accent) r g b / 0.18);
  border-color: var(--chat-accent);
  transform: rotate(90deg);
}
.web-chat-sessions-new svg { width: 12px; height: 12px; }

.web-chat-sessions-list {
  position: relative;
  list-style: none;
  margin: 0;
  padding: 0.25rem 0 0 0;
  overflow: auto;
}
.web-chat-sessions-list::before {
  content: "";
  position: absolute;
  left: 4.25rem;
  top: 0; bottom: 0;
  width: 1px;
  background: linear-gradient(180deg,
    transparent 0%,
    rgb(from var(--chat-secondary) r g b / 0.18) 6%,
    rgb(from var(--chat-secondary) r g b / 0.28) 90%,
    transparent 100%);
  pointer-events: none;
}
.web-chat-sessions-state {
  margin: 1rem 1.25rem;
  padding: 1rem;
  border: 1px solid var(--chat-border-soft);
  border-radius: 18px;
  background: var(--chat-surface-inset);
  color: var(--chat-text-muted);
}
.web-chat-sessions-state[data-tone="error"] {
  border-color: rgb(from var(--chat-error) r g b / 0.28);
  background: rgb(from var(--chat-error) r g b / 0.08);
}
.web-chat-sessions-state-tag {
  display: block;
  margin-bottom: 0.35rem;
  font-family: var(--chat-font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--chat-accent);
}
.web-chat-sessions-state[data-tone="error"] .web-chat-sessions-state-tag {
  color: var(--chat-error);
}
.web-chat-sessions-state p {
  margin: 0;
  font-family: var(--chat-font-display);
  font-size: 13px;
  font-style: italic;
  line-height: 1.45;
}
.web-chat-sessions-state button,
.web-chat-sessions-inline-error button,
.web-chat-session-notice button {
  border: 0;
  background: transparent;
  color: var(--chat-accent);
  cursor: pointer;
  font-family: var(--chat-font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.web-chat-sessions-state button {
  margin-top: 0.8rem;
  padding: 0;
}
.web-chat-sessions-empty-spacer {
  min-height: 0;
}
.web-chat-sessions-inline-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0.25rem 1.25rem 0.5rem;
  padding: 0.55rem 0.7rem;
  border: 1px solid rgb(from var(--chat-error) r g b / 0.22);
  border-radius: 999px;
  background: rgb(from var(--chat-error) r g b / 0.07);
  color: var(--chat-error);
  font-family: var(--chat-font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.web-chat-session-skeleton {
  position: relative;
  display: grid;
  grid-template-columns: 3.4rem 1fr;
  gap: 0.85rem;
  padding: 0.8rem 1.25rem 0.8rem 0.85rem;
}
.web-chat-session-skeleton > span,
.web-chat-session-skeleton div span {
  display: block;
  border-radius: 999px;
  background: linear-gradient(90deg,
    var(--chat-surface-soft),
    var(--chat-surface),
    var(--chat-surface-soft));
  background-size: 200% 100%;
  animation: web-chat-session-pulse 1.2s ease-in-out infinite;
}
.web-chat-session-skeleton > span {
  width: 2.6rem;
  height: 0.55rem;
  justify-self: end;
  margin-top: 0.25rem;
}
.web-chat-session-skeleton div {
  display: grid;
  gap: 0.45rem;
  padding-left: 0.85rem;
}
.web-chat-session-skeleton div span:first-child { width: 82%; height: 0.7rem; }
.web-chat-session-skeleton div span:last-child { width: 46%; height: 0.55rem; }
@keyframes web-chat-session-pulse {
  0% { background-position: 0% 50%; }
  100% { background-position: -200% 50%; }
}

.web-chat-session-item {
  position: relative;
}
.web-chat-session {
  position: relative;
  display: grid;
  grid-template-columns: 3.4rem 1fr;
  gap: 0.85rem;
  align-items: start;
  width: 100%;
  border: 0;
  background: transparent;
  padding: 0.75rem 6.6rem 0.75rem 0.85rem;
  cursor: pointer;
  text-align: left;
  color: inherit;
  transition: background 0.2s ease;
}
.web-chat-session:hover:not(:disabled) { background: var(--chat-surface-soft); }
.web-chat-session:disabled {
  cursor: wait;
  opacity: 0.72;
}
.web-chat-session:disabled:not([data-loading="true"]) {
  cursor: not-allowed;
}
.web-chat-session-time {
  padding-top: 0.15rem;
  font-family: var(--chat-font-label);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--chat-text-light);
  text-align: right;
}
.web-chat-session::before {
  content: "";
  position: absolute;
  left: calc(4.25rem - 5px);
  top: 0.9rem;
  width: 11px; height: 11px;
  border-radius: 50%;
  background: var(--chat-bg);
  box-shadow:
    inset 0 0 0 2px rgb(from var(--chat-secondary) r g b / 0.65),
    0 0 0 3px var(--chat-bg);
  z-index: 1;
  transition: box-shadow 0.2s ease;
}
.web-chat-session:hover::before {
  box-shadow:
    inset 0 0 0 2px var(--chat-secondary),
    0 0 0 3px var(--chat-bg),
    0 0 10px rgb(from var(--chat-secondary) r g b / 0.5);
}
.web-chat-session::after {
  content: "";
  position: absolute;
  left: calc(4.25rem + 6px);
  top: 1.3rem;
  width: calc(1.6rem - 6px);
  height: 1px;
  background: linear-gradient(90deg, rgb(from var(--chat-secondary) r g b / 0.4), transparent);
}
.web-chat-session-body {
  grid-column: 2;
  min-width: 0;
  display: grid;
  gap: 0.2rem;
  padding-left: 0.85rem;
}
.web-chat-session-title {
  margin: 0;
  font-family: var(--chat-font-body);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.35;
  color: var(--chat-text);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
}
.web-chat-session-subtitle {
  font-family: var(--chat-font-label);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--chat-accent);
}
.web-chat-session[data-active="true"] {
  background: linear-gradient(90deg,
    rgb(from var(--chat-accent) r g b / 0.08) 0%,
    rgb(from var(--chat-accent) r g b / 0.02) 100%);
}
.web-chat-session[data-active="true"]::before {
  background: var(--chat-accent);
  box-shadow:
    0 0 0 3px var(--chat-bg),
    0 0 14px rgb(from var(--chat-accent) r g b / 0.6);
}
.web-chat-session[data-active="true"]::after {
  background: linear-gradient(90deg,
    rgb(from var(--chat-accent) r g b / 0.6),
    rgb(from var(--chat-accent) r g b / 0.2));
}
.web-chat-session[data-active="true"] .web-chat-session-time { color: var(--chat-accent); }
.web-chat-session-rename,
.web-chat-session-archive,
.web-chat-session-delete {
  position: absolute;
  top: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 50%;
  background: transparent;
  color: var(--chat-text-muted);
  cursor: pointer;
  opacity: 0.72;
  transform: translateY(-50%) scale(1);
  transition: opacity 0.18s ease, color 0.18s ease, border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
}
.web-chat-session-rename { right: 4.45rem; }
.web-chat-session-archive { right: 2.65rem; }
.web-chat-session-delete { right: 0.85rem; }
.web-chat-session-item:hover .web-chat-session-rename,
.web-chat-session-item:hover .web-chat-session-archive,
.web-chat-session-item:hover .web-chat-session-delete,
.web-chat-session-rename:focus-visible,
.web-chat-session-archive:focus-visible,
.web-chat-session-delete:focus-visible,
.web-chat-session-rename:disabled,
.web-chat-session-archive:disabled,
.web-chat-session-delete:disabled {
  opacity: 1;
  transform: translateY(-50%) scale(1);
}
.web-chat-session-rename:hover:not(:disabled) {
  border-color: rgb(from var(--chat-accent) r g b / 0.34);
  background: rgb(from var(--chat-accent) r g b / 0.1);
  color: var(--chat-accent);
}
.web-chat-session-archive:hover:not(:disabled) {
  border-color: rgb(from var(--chat-secondary) r g b / 0.34);
  background: rgb(from var(--chat-secondary) r g b / 0.1);
  color: var(--chat-secondary);
}
.web-chat-session-delete:hover:not(:disabled) {
  border-color: rgb(from var(--chat-error) r g b / 0.34);
  background: rgb(from var(--chat-error) r g b / 0.1);
  color: var(--chat-error);
}
.web-chat-session-rename:disabled,
.web-chat-session-archive:disabled,
.web-chat-session-delete:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.web-chat-session-rename svg,
.web-chat-session-archive svg,
.web-chat-session-delete svg { width: 13px; height: 13px; }

.web-chat-sessions-footer {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.85rem 1.25rem 0;
  border-top: 1px solid var(--chat-border-soft);
  margin-top: 0.5rem;
  font-family: var(--chat-font-label);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--chat-text-light);
}
.web-chat-sessions-footer-id {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.web-chat-sessions-footer-id::before {
  content: "";
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--chat-success);
  box-shadow: 0 0 6px rgb(from var(--chat-success) r g b / 0.6);
}

/* ─── Conversation (mycelial spine) ─── */
.web-chat-session-notice {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.35rem 0.9rem;
  align-items: center;
  padding: 0.85rem 1rem;
  border: 1px solid rgb(from var(--chat-accent) r g b / 0.24);
  border-radius: 20px;
  background: linear-gradient(135deg,
    rgb(from var(--chat-accent) r g b / 0.09),
    var(--chat-surface-inset));
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.04);
}
.web-chat-session-notice[data-tone="error"] {
  border-color: rgb(from var(--chat-error) r g b / 0.28);
  background: linear-gradient(135deg,
    rgb(from var(--chat-error) r g b / 0.1),
    var(--chat-surface-inset));
}
.web-chat-session-notice-tag {
  grid-column: 1 / -1;
  font-family: var(--chat-font-label);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--chat-accent);
}
.web-chat-session-notice[data-tone="error"] .web-chat-session-notice-tag {
  color: var(--chat-error);
}
.web-chat-session-notice p {
  margin: 0;
  color: var(--chat-text-muted);
  font-size: 13px;
  line-height: 1.45;
}
.web-chat-session-notice button { padding: 0.15rem 0 0; }

.web-chat-conversation {
  min-height: 0;
  overflow: auto;
  padding: 0.25rem;
}
.web-chat-conversation::-webkit-scrollbar { width: 8px; }
.web-chat-conversation::-webkit-scrollbar-thumb {
  background: var(--chat-surface);
  border-radius: 999px;
}
.web-chat-conversation-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  min-width: 0;
  min-height: 100%;
  padding: 1.25rem 0.5rem 0.5rem;
}

/* ─── Empty state — centered placeholder shown before the first
   message lands. ─── */
.web-chat-empty-state {
  margin: auto;
  max-width: 38rem;
  padding: 2rem 1.5rem;
  color: var(--chat-text-muted);
  display: grid;
  gap: 1.25rem;
  justify-items: center;
  text-align: center;
}
.web-chat-empty-state-glyph {
  width: 180px;
  height: 88px;
  overflow: visible;
  color: var(--chat-secondary);
}
.web-chat-empty-state-glyph path {
  fill: none;
  stroke: currentColor;
  stroke-width: 1;
  stroke-linecap: round;
  stroke-dasharray: 300;
  stroke-dashoffset: 300;
  animation: web-chat-rhizome-draw 2.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}
.web-chat-empty-state-glyph path:nth-child(2) { animation-delay: 0.15s; opacity: 0.7; }
.web-chat-empty-state-glyph path:nth-child(3) { animation-delay: 0.3s; opacity: 0.55; }
.web-chat-empty-state-glyph path:nth-child(4) { animation-delay: 0.45s; opacity: 0.45; }
.web-chat-empty-state-glyph circle {
  fill: var(--chat-accent);
  opacity: 0;
  animation: web-chat-rhizome-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  filter: drop-shadow(0 0 4px var(--chat-accent));
}
.web-chat-empty-state-glyph circle:nth-of-type(1) { animation-delay: 1.0s; }
.web-chat-empty-state-glyph circle:nth-of-type(2) { animation-delay: 1.3s; fill: var(--chat-secondary); filter: drop-shadow(0 0 4px var(--chat-secondary)); }
.web-chat-empty-state-glyph circle:nth-of-type(3) { animation-delay: 1.6s; }
@keyframes web-chat-rhizome-draw { to { stroke-dashoffset: 0; } }
@keyframes web-chat-rhizome-pop { to { opacity: 1; } }
.web-chat-empty-state-eyebrow {
  font-family: var(--chat-font-label);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--chat-text-light);
}
.web-chat-empty-state h2 {
  margin: 0;
  font-family: var(--chat-font-display);
  font-weight: 520;
  font-size: clamp(1.75rem, 3vw, 2.5rem);
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--chat-text);
}
.web-chat-empty-state h2 em {
  font-style: italic;
  color: var(--chat-accent);
  font-weight: 400;
}
.web-chat-empty-state p { margin: 0; max-width: 40ch; line-height: 1.7; }

/* ─── Messages ─── */
.web-chat-message {
  max-width: min(48rem, 100%);
  min-width: 0;
  display: grid;
  gap: 0.5rem;
}
.web-chat-message-header {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  font-family: var(--chat-font-label);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--chat-text-light);
}
.web-chat-message-header time {
  color: var(--chat-text-light);
  font-weight: 400;
  letter-spacing: 0.12em;
}
.web-chat-message-header time::before { content: "·"; margin: 0 0.45rem; opacity: 0.6; }
.web-chat-message-bubble { min-width: 0; line-height: 1.7; }
.web-chat-message-bubble :first-child { margin-top: 0; }
.web-chat-message-bubble :last-child { margin-bottom: 0; }
.web-chat-message-bubble p { margin: 0 0 0.75rem; }
.web-chat-message-bubble code {
  padding: 0.1em 0.35em;
  border-radius: 4px;
  background: var(--chat-surface);
  font-family: var(--chat-font-label);
  font-size: 0.9em;
}
.web-chat-message-bubble a {
  color: var(--chat-accent);
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: rgb(from var(--chat-accent) r g b / 0.5);
}
.web-chat-message-bubble ul,
.web-chat-message-bubble ol { margin: 0 0 0.75rem; padding-left: 1.25rem; }
.web-chat-message-bubble li { margin-bottom: 0.35rem; }
.web-chat-uploaded-file {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  max-width: min(100%, 20rem);
  margin-top: 0.65rem;
  padding: 0.42rem 0.7rem;
  border: 1px solid rgb(from var(--chat-accent) r g b / 0.35);
  border-radius: 999px;
  background: rgb(from var(--chat-accent) r g b / 0.12);
  font-family: var(--chat-font-label);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-decoration: none;
  text-transform: uppercase;
}
.web-chat-uploaded-file-kicker { color: var(--chat-text-light); }
.web-chat-uploaded-file-name {
  min-width: 0;
  overflow: hidden;
  color: var(--chat-accent);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.web-chat-progress-part {
  display: grid;
  gap: 0.35rem;
  margin: 0.75rem 0;
  padding: 0.65rem 0.8rem;
  border: 1px solid rgb(from var(--chat-accent) r g b / 0.28);
  border-radius: 12px;
  background: rgb(from var(--chat-accent) r g b / 0.08);
  color: var(--chat-text);
  font-size: 0.92rem;
}
.web-chat-progress-part[data-status="completed"] {
  border-color: rgb(from var(--chat-success) r g b / 0.35);
  background: rgb(from var(--chat-success) r g b / 0.08);
}
.web-chat-progress-part[data-status="failed"] {
  border-color: rgb(from var(--chat-error) r g b / 0.38);
  background: rgb(from var(--chat-error) r g b / 0.08);
}
.web-chat-progress-kicker {
  font-family: var(--chat-font-label);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--chat-accent);
}
.web-chat-progress-part[data-status="completed"] .web-chat-progress-kicker { color: var(--chat-success); }
.web-chat-progress-part[data-status="failed"] .web-chat-progress-kicker { color: var(--chat-error); }
.web-chat-progress-title { font-weight: 700; }
.web-chat-progress-message { color: var(--chat-text-muted); }
.web-chat-progress-meter {
  height: 0.35rem;
  overflow: hidden;
  border-radius: 999px;
  background: var(--chat-surface);
}
.web-chat-progress-meter span {
  display: block;
  height: 100%;
  width: var(--web-chat-progress-value, 0%);
  border-radius: inherit;
  background: currentColor;
}
/* user — amber notched panel */
.web-chat-message[data-role="user"] .web-chat-message-header { color: var(--chat-accent); }
.web-chat-message[data-role="user"] .web-chat-message-bubble {
  padding: 0.9rem 1.1rem;
  background: linear-gradient(135deg,
    rgb(from var(--chat-accent) r g b / 0.14) 0%,
    rgb(from var(--chat-accent) r g b / 0.04) 100%);
  border: 1px solid rgb(from var(--chat-accent) r g b / 0.25);
  color: var(--chat-text);
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%);
}

/* assistant — editorial body, serif drop-cap on first paragraph */
.web-chat-message[data-role="assistant"] .web-chat-message-header { color: var(--chat-secondary); }
.web-chat-message[data-role="assistant"] .web-chat-message-bubble {
  padding: 0.1rem 0 0;
  color: var(--chat-text);
  font-family: var(--chat-font-body);
  font-size: 16px;
  line-height: 1.8;
}
.web-chat-message[data-role="assistant"] .web-chat-message-bubble > .web-chat-markdown-response:first-child > p:first-of-type::first-letter,
.web-chat-message[data-role="assistant"] .web-chat-message-bubble > p:first-of-type::first-letter {
  font-family: var(--chat-font-display);
  font-weight: 520;
  font-size: 2.4em;
  float: left;
  line-height: 0.85;
  padding: 0.18em 0.18em 0 0;
  color: var(--chat-accent);
}

/* ─── Markdown / code blocks. Streamdown provides the AI Elements-style
   markdown renderer; these selectors keep the Rizom visual treatment. ─── */
.web-chat-markdown-response {
  display: grid;
  gap: 0.75rem;
}
.web-chat-markdown-response > * { margin-block: 0; }
.web-chat-markdown-response p { margin: 0; }
.web-chat-markdown-response blockquote {
  margin: 0;
  padding-left: 1rem;
  border-left: 1px solid var(--color-border);
  color: var(--color-text-muted);
}
.web-chat-markdown-response :not(pre) > code {
  padding: 0.08rem 0.28rem;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  background: rgb(0 0 0 / 0.25);
  font-family: var(--font-label);
  font-size: 0.88em;
}
.web-chat-code-block,
.web-chat-markdown-response pre {
  margin: 0.85rem 0 0;
  padding: 0.9rem 1rem;
  border: 1px solid var(--chat-border);
  border-radius: 12px;
  overflow: auto;
  background: var(--chat-surface-deep);
  font-family: var(--chat-font-label);
  font-size: 13px;
  line-height: 1.6;
  color: var(--chat-text);
}
.web-chat-code-block figcaption {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.5rem 0.85rem;
  border-bottom: 1px solid var(--chat-border);
  color: var(--chat-text-muted);
  font-family: var(--chat-font-label);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.web-chat-code-block pre {
  margin: 0;
  padding: 0.9rem 1rem;
  overflow: auto;
  font-family: var(--chat-font-label);
  font-size: 13px;
  line-height: 1.6;
  color: var(--chat-text);
}

/* ─── Tool calls group — wraps multiple consecutive tool results
   under a single collapsible header so a message with many tool
   calls reads as one line, not N. ─── */
.web-chat-tool-group {
  margin: 0.6rem 0 0;
}
details.web-chat-tool-group > summary.web-chat-tool-group-header {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.15rem 0;
  font-family: var(--chat-font-label);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--chat-text-light);
  cursor: pointer;
  user-select: none;
  list-style: none;
}
details.web-chat-tool-group > summary.web-chat-tool-group-header:hover {
  color: var(--chat-text-muted);
}
details.web-chat-tool-group > summary.web-chat-tool-group-header::-webkit-details-marker {
  display: none;
}
details.web-chat-tool-group[open] > summary > .web-chat-data-part-chevron {
  transform: rotate(45deg);
}
.web-chat-tool-group-body {
  margin-top: 0.4rem;
  padding-left: 0.85rem;
  border-left: 1px solid var(--chat-border);
  display: grid;
  gap: 0.2rem;
}
.web-chat-tool-group-body .web-chat-data-part { margin: 0; }

/* ─── Data parts — debugging affordance. Just a tiny muted bracket
   header you can ignore or click to inspect; no card chrome, no
   colored accent rails. ─── */
.web-chat-data-part {
  margin: 0.6rem 0 0;
  background: transparent;
  border: 0;
}
details.web-chat-data-part > summary.web-chat-data-part-header {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.15rem 0;
  font-family: var(--chat-font-label);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--chat-text-light);
  cursor: pointer;
  user-select: none;
  list-style: none;
}
details.web-chat-data-part > summary.web-chat-data-part-header:hover {
  color: var(--chat-text-muted);
}
details.web-chat-data-part > summary.web-chat-data-part-header::-webkit-details-marker {
  display: none;
}
.web-chat-data-part-chevron {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-right: 1px solid currentColor;
  border-bottom: 1px solid currentColor;
  transform: rotate(-45deg);
  transform-origin: 60% 60%;
  transition: transform 0.2s ease;
  opacity: 0.7;
}
details.web-chat-data-part[open] > summary > .web-chat-data-part-chevron {
  transform: rotate(45deg);
}
.web-chat-data-part-body {
  margin-top: 0.4rem;
  padding: 0.6rem 0.75rem;
  border-left: 1px solid var(--chat-border);
  background: var(--chat-surface-inset);
}
.web-chat-data-part-body pre {
  margin: 0;
  font-family: var(--chat-font-label);
  font-size: 12px;
  line-height: 1.5;
  color: var(--chat-text-muted);
  overflow: auto;
}
.web-chat-data-part-body > div + div,
.web-chat-data-part-body > div + pre {
  margin-top: 0.6rem;
}
.web-chat-data-part-label {
  margin: 0 0 0.25rem;
  font-family: var(--chat-font-label);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--chat-text-light);
}
.web-chat-data-part-status {
  color: var(--chat-text-light);
  font-weight: 400;
}
.web-chat-data-part-status[data-state="output-error"],
.web-chat-data-part-status[data-state="output-denied"] {
  color: var(--chat-error);
}
.web-chat-data-part-status[data-state="approval-requested"] {
  color: var(--chat-accent);
}

.web-chat-attachment-card {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.8rem;
  margin: 1rem 0 0;
  border: 1px solid var(--chat-border);
  background: linear-gradient(135deg,
    rgb(from var(--chat-accent) r g b / 0.08) 0%,
    rgb(from var(--chat-secondary) r g b / 0.04) 100%);
  overflow: hidden;
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%);
}
.web-chat-attachment-card::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: linear-gradient(180deg, var(--chat-accent), var(--chat-secondary));
}
.web-chat-attachment-preview {
  display: block;
  width: auto;
  max-width: 100%;
  height: auto;
  max-height: min(70vh, 520px);
  justify-self: center;
  object-fit: contain;
  border-bottom: 1px solid var(--chat-border-soft);
  background: var(--chat-surface-inset);
}
.web-chat-attachment-body {
  display: grid;
  gap: 0.45rem;
  padding: 0.95rem 1rem 1rem 1.15rem;
}
.web-chat-attachment-kicker,
.web-chat-attachment-meta {
  font-family: var(--chat-font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--chat-text-light);
}
.web-chat-attachment-kicker { color: var(--chat-accent); }
.web-chat-attachment-card[data-status="pending"] .web-chat-attachment-kicker,
.web-chat-attachment-card[data-status="processing"] .web-chat-attachment-kicker {
  color: var(--chat-secondary);
}
.web-chat-attachment-card[data-status="failed"] .web-chat-attachment-kicker {
  color: var(--chat-error);
}
.web-chat-attachment-body h4 {
  margin: 0;
  font-family: var(--chat-font-body);
  font-size: 15px;
  line-height: 1.35;
  color: var(--chat-text);
}
.web-chat-attachment-body p {
  margin: 0;
  color: var(--chat-text-muted);
  line-height: 1.5;
}
.web-chat-attachment-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-top: 0.25rem;
}
.web-chat-attachment-actions a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2rem;
  padding: 0.35rem 0.7rem;
  border: 1px solid var(--chat-border);
  border-radius: 999px;
  color: var(--chat-text);
  background: var(--chat-surface-soft);
  font-family: var(--chat-font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-decoration: none;
  text-transform: uppercase;
}
.web-chat-attachment-actions a:hover {
  border-color: rgb(from var(--chat-accent) r g b / 0.48);
  color: var(--chat-accent);
}
.web-chat-attachment-actions a[aria-disabled="true"] {
  pointer-events: none;
  cursor: not-allowed;
  opacity: 0.55;
}

/* ─── Confirmations — instrument card. This is an action affordance,
   not a debug toggle, so it keeps the card chrome to grab attention. ─── */
.web-chat-confirmation {
  position: relative;
  margin: 1rem 0 0;
  border: 1px solid var(--chat-border);
  background: linear-gradient(135deg,
    rgb(from var(--chat-secondary) r g b / 0.06) 0%,
    rgb(from var(--chat-secondary) r g b / 0.01) 100%);
  overflow: hidden;
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%);
}
.web-chat-confirmation::before {
  content: "";
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 2px;
  background: linear-gradient(180deg,
    rgb(from var(--chat-secondary) r g b / 0.9),
    rgb(from var(--chat-secondary) r g b / 0.2));
}
.web-chat-confirmation-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.95rem;
  border-bottom: 1px solid var(--chat-border);
  font-family: var(--chat-font-label);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--chat-secondary);
}
.web-chat-confirmation-header::before {
  content: "[";
  color: var(--chat-text-light);
  font-weight: 400;
  letter-spacing: 0;
}
.web-chat-confirmation-header::after {
  content: "]";
  color: var(--chat-text-light);
  font-weight: 400;
  letter-spacing: 0;
  margin-left: auto;
}
.web-chat-confirmation[data-state="resolved"] {
  background: linear-gradient(135deg,
    rgb(from var(--chat-success) r g b / 0.07) 0%,
    rgb(from var(--chat-success) r g b / 0.01) 100%);
}
.web-chat-confirmation[data-state="resolved"]::before {
  background: linear-gradient(180deg,
    rgb(from var(--chat-success) r g b / 0.9),
    rgb(from var(--chat-success) r g b / 0.2));
}
.web-chat-confirmation[data-state="resolved"] .web-chat-confirmation-header { color: var(--chat-success); }
.web-chat-confirmation[data-state="error"] {
  border-color: rgb(from var(--chat-error) r g b / 0.35);
}
.web-chat-confirmation[data-state="error"]::before {
  background: linear-gradient(
    to bottom,
    rgb(from var(--chat-error) r g b / 0.9),
    rgb(from var(--chat-error) r g b / 0.2));
}
.web-chat-confirmation[data-state="error"] .web-chat-confirmation-header {
  color: var(--chat-error);
}

.web-chat-confirmation-body { padding: 0.85rem; display: grid; gap: 0.85rem; }
.web-chat-confirmation-summary { margin: 0; color: var(--chat-text); line-height: 1.6; }
.web-chat-confirmation-details {
  padding: 0.75rem 0.85rem;
  border-radius: 10px;
  background: var(--chat-surface-inset);
  color: var(--chat-text-muted);
  font-family: var(--chat-font-label);
  font-size: 12.5px;
}
.web-chat-confirmation-details strong { color: var(--chat-text); font-weight: 600; }
.web-chat-confirmation-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.web-chat-confirmation-actions button {
  flex: 1 1 auto;
  min-height: 40px;
  padding: 0 1.1rem;
  border: 1px solid var(--chat-border);
  border-radius: 999px;
  background: var(--chat-surface-soft);
  color: var(--chat-text);
  font-family: var(--chat-font-label);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
}
.web-chat-confirmation-actions button:hover { transform: translateY(-1px); border-color: var(--chat-text-light); }
.web-chat-confirmation-actions button[data-variant="primary"] {
  background: var(--chat-accent);
  color: var(--chat-on-accent);
  border-color: transparent;
  box-shadow: 0 8px 32px -8px var(--chat-glow-cta);
}
.web-chat-confirmation-actions button[data-variant="primary"]:hover {
  background: var(--chat-accent-dark);
  box-shadow: 0 12px 36px -8px var(--chat-glow-cta-strong);
}
.web-chat-confirmation-actions button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
.web-chat-confirmation-result {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  width: fit-content;
  max-width: 100%;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  background: rgb(from var(--chat-success) r g b / 0.12);
  color: var(--chat-success);
  font-family: var(--chat-font-label);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  line-height: 1.4;
  overflow-wrap: anywhere;
  text-transform: uppercase;
}
.web-chat-confirmation-result[data-variant="error"] {
  background: rgb(from var(--chat-error) r g b / 0.12);
  color: var(--chat-error);
}
.web-chat-confirmation-result[data-variant="declined"] {
  background: rgb(from var(--chat-text-muted) r g b / 0.12);
  color: var(--chat-text-muted);
}

/* ─── Status (growing root + italic phrase) ─── */
.web-chat-status {
  display: inline-flex;
  align-items: center;
  gap: 0.85rem;
  margin: 0;
  color: var(--chat-text-muted);
  width: max-content;
  max-width: 100%;
}
.web-chat-status[data-status="ready"] { display: none; }
.web-chat-status-rail {
  position: relative;
  width: 56px; height: 14px;
  flex: none;
}
.web-chat-status-rail::before {
  content: "";
  position: absolute;
  left: 0; top: 50%;
  width: 100%; height: 1px;
  transform: translateY(-50%);
  background: linear-gradient(90deg,
    rgb(from var(--chat-accent) r g b / 0.45),
    rgb(from var(--chat-secondary) r g b / 0.45));
}
.web-chat-status-rail::after {
  content: "";
  position: absolute;
  left: 100%; top: 50%;
  width: 6px; height: 6px;
  transform: translate(-3px, -50%);
  border-radius: 50%;
  background: var(--chat-accent);
  box-shadow: 0 0 10px rgb(from var(--chat-accent) r g b / 0.7);
  animation: web-chat-rhizome-grow 1.6s ease-in-out infinite;
}
@keyframes web-chat-rhizome-grow {
  0%   { left: 10%; opacity: 0.4; }
  50%  { left: 100%; opacity: 1; }
  100% { left: 10%; opacity: 0.4; }
}
.web-chat-status-phrase {
  font-family: var(--chat-font-display);
  font-style: italic;
  font-weight: 400;
  font-size: 15px;
  letter-spacing: -0.01em;
  color: var(--chat-text-muted);
}
.web-chat-status-meta {
  font-family: var(--chat-font-label);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--chat-text-light);
}
.web-chat-status-meta::before { content: "·"; margin-right: 0.55rem; opacity: 0.5; }

/* ─── Error ─── */
.web-chat-error {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.85rem;
  padding: 0.85rem 1rem;
  border: 1px solid rgb(from var(--chat-error) r g b / 0.35);
  background: linear-gradient(135deg,
    rgb(from var(--chat-error) r g b / 0.1) 0%,
    rgb(from var(--chat-error) r g b / 0.02) 100%);
  color: var(--chat-text);
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%);
}
.web-chat-error::before {
  content: "";
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 2px;
  background: linear-gradient(180deg,
    rgb(from var(--chat-error) r g b / 0.9),
    rgb(from var(--chat-error) r g b / 0.2));
}
.web-chat-error-tag {
  font-family: var(--chat-font-label);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--chat-error);
}
.web-chat-error p { margin: 0; font-family: var(--chat-font-body); font-size: 14px; color: var(--chat-text); }
.web-chat-error button {
  padding: 0.4rem 0.85rem;
  border: 1px solid rgb(from var(--chat-error) r g b / 0.5);
  border-radius: 999px;
  background: transparent;
  color: var(--chat-error);
  font-family: var(--chat-font-label);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
}
.web-chat-error button:hover { background: rgb(from var(--chat-error) r g b / 0.18); }

/* ─── Prompt input (instrument card) ─── */
.web-chat-prompt-input {
  position: relative;
  display: grid;
  gap: 0.5rem;
  padding: 0.95rem 1rem 0.75rem;
  border: 1px solid var(--chat-border);
  background: var(--chat-surface-soft);
  transition: border-color 0.25s ease, background 0.25s ease, box-shadow 0.25s ease;
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%);
}
.web-chat-prompt-input::before {
  content: "";
  position: absolute;
  left: 0; top: 0; bottom: 16px;
  width: 2px;
  background: linear-gradient(180deg, rgb(from var(--chat-accent) r g b / 0.4), transparent);
}
.web-chat-prompt-input:focus-within {
  border-color: rgb(from var(--chat-accent) r g b / 0.5);
  background: rgb(from var(--chat-accent) r g b / 0.05);
  box-shadow: 0 0 0 4px rgb(from var(--chat-accent) r g b / 0.08);
}
.web-chat-prompt-input label {
  font-family: var(--chat-font-label);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--chat-text-light);
}
.web-chat-prompt-textarea {
  width: 100%;
  min-height: 3.25rem;
  max-height: 14rem;
  padding: 0.4rem 0;
  border: 0;
  background: transparent;
  color: var(--chat-text);
  resize: none;
  outline: none;
  font-family: var(--chat-font-body);
  font-size: 15px;
  line-height: 1.55;
}
.web-chat-prompt-textarea::placeholder { color: var(--chat-text-light); }
.web-chat-upload-notice {
  margin: 0;
  padding: 0.55rem 0.75rem;
  border: 1px solid rgb(from var(--chat-accent) r g b / 0.26);
  border-radius: 14px;
  background: rgb(from var(--chat-accent) r g b / 0.08);
  color: var(--chat-text-muted);
  font-family: var(--chat-font-label);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.web-chat-upload-notice[data-tone="error"] {
  border-color: rgb(from var(--chat-error) r g b / 0.42);
  background: rgb(from var(--chat-error) r g b / 0.1);
  color: var(--chat-error);
}
.web-chat-prompt-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.web-chat-prompt-attachment {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  max-width: min(100%, 18rem);
  padding: 0.35rem 0.45rem 0.35rem 0.65rem;
  border: 1px solid rgb(from var(--chat-accent) r g b / 0.28);
  border-radius: 999px;
  background: rgb(from var(--chat-accent) r g b / 0.1);
  color: var(--chat-text);
  font-family: var(--chat-font-label);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.web-chat-prompt-attachment span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.web-chat-prompt-attachment button,
.web-chat-prompt-attach {
  border: 1px solid var(--chat-border);
  background: var(--chat-surface);
  color: var(--chat-text-muted);
  cursor: pointer;
  font-family: var(--chat-font-label);
}
.web-chat-prompt-attachment button {
  display: inline-grid;
  place-items: center;
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 50%;
  padding: 0;
  line-height: 1;
}
.web-chat-prompt-attach {
  min-height: 36px;
  padding: 0 0.85rem;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.web-chat-prompt-attachment button:hover,
.web-chat-prompt-attach:hover {
  border-color: var(--chat-accent);
  color: var(--chat-accent);
}
.web-chat-prompt-footer {
  display: flex; align-items: center; justify-content: space-between;
  gap: 0.75rem;
}
.web-chat-prompt-hint {
  font-family: var(--chat-font-label);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--chat-text-light);
}
.web-chat-prompt-hint kbd {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--chat-surface);
  border: 1px solid var(--chat-border);
  font-family: var(--chat-font-label);
  font-size: 10px;
  color: var(--chat-text);
}
.web-chat-prompt-submit {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 40px;
  padding: 0 1.1rem;
  border: 0;
  border-radius: 999px;
  background: var(--chat-accent);
  color: var(--chat-on-accent);
  font-family: var(--chat-font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
  box-shadow: 0 8px 24px -8px var(--chat-glow-cta);
}
.web-chat-prompt-submit:hover {
  transform: translateY(-1px);
  background: var(--chat-accent-dark);
  box-shadow: 0 14px 36px -10px var(--chat-glow-cta-strong);
}
.web-chat-prompt-submit:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
.web-chat-prompt-submit svg {
  width: 14px; height: 14px;
  transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.web-chat-prompt-submit:hover svg { transform: translateX(2px); }

/* ─── Mobile drawer trigger + chrome (DOM in all viewports; hidden on desktop) ─── */
.web-chat-mobile-trigger {
  display: none;
}
.web-chat-mobile-drawer-scrim {
  display: none;
}
.web-chat-mobile-drawer-close {
  display: none;
}

/* ─── Tablet / phone ───────────────────────────────────────────────
   Sessions become a slide-in drawer triggered by a hamburger in the
   header. The chat surface fills the full width. Drawer state is
   driven by [data-drawer-open] on .web-chat-shell.
   ──────────────────────────────────────────────────────────────── */
@media (max-width: 760px) {
  .web-chat-shell {
    position: relative;
    grid-template-columns: 1fr;
    height: auto;
    min-height: 100vh;
  }

  /* Sessions panel → absolute, slide-in from the left. The internal
     component (.web-chat-sessions header, search, list, sessions, footer)
     stays exactly as on desktop — only positioning + transform change. */
  .web-chat-shell .web-chat-sessions {
    position: absolute;
    top: 0; bottom: 0; left: 0;
    width: 86%;
    max-width: 320px;
    z-index: 5;
    border-right: 1px solid var(--chat-border-soft);
    border-bottom: 0;
    /* Theme-flipping background. Earlier rgb(from --chat-surface-deep ...)
       extracted the underlying dark RGB even in light mode, leaving the
       drawer as a dark slab on a light page. */
    background: var(--chat-bg-card);
    box-shadow: 0 12px 40px -12px rgb(0 0 0 / 0.45);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    transform: translateX(-100%);
    transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  .web-chat-shell[data-drawer-open="true"] .web-chat-sessions {
    transform: translateX(0);
  }

  /* Scrim behind the drawer; only renders at mobile widths. */
  .web-chat-shell .web-chat-mobile-drawer-scrim {
    display: block;
    position: absolute;
    inset: 0;
    z-index: 4;
    background: rgb(0 0 0 / 0.55);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.25s ease;
  }
  .web-chat-shell[data-drawer-open="true"] .web-chat-mobile-drawer-scrim {
    opacity: 1;
    pointer-events: auto;
  }

  /* Close button floats over the drawer's top-right when open. */
  .web-chat-shell .web-chat-mobile-drawer-close {
    display: inline-grid;
    place-items: center;
    position: absolute;
    top: 0.85rem;
    left: calc(86% - 3rem);
    z-index: 6;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 1px solid transparent;
    background: var(--chat-surface);
    color: var(--chat-text-muted);
    cursor: pointer;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.25s ease, color 0.2s, border-color 0.2s;
  }
  .web-chat-shell[data-drawer-open="true"] .web-chat-mobile-drawer-close {
    opacity: 1;
    pointer-events: auto;
  }
  .web-chat-shell .web-chat-mobile-drawer-close:hover {
    color: var(--chat-accent);
    border-color: rgb(from var(--chat-accent) r g b / 0.35);
  }
  .web-chat-shell .web-chat-mobile-drawer-close svg {
    width: 18px;
    height: 18px;
  }
  @media (max-width: 372px) {
    /* On very narrow viewports the drawer hits its 320px cap, so the
       close button needs to be anchored to that cap (not to 86%). */
    .web-chat-shell .web-chat-mobile-drawer-close {
      left: auto;
      right: calc(100% - 320px + 0.85rem);
    }
  }

  /* Header on mobile: hamburger (left) · brand (center, takes remaining
     space) · actions (right). The hamburger button is a direct child of
     .web-chat-header (not nested in .web-chat-header-actions) so it
     anchors to the page edge, matching the mockup. */
  .web-chat-header {
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.5rem;
  }
  .web-chat-header-actions { padding-top: 0; }
  /* Match the theme toggle size to its neighbors (hamburger + New are
     both 40×40 on mobile) so the action row reads as one band. */
  .web-chat-icon-action {
    width: 40px;
    height: 40px;
  }
  .web-chat-icon-action svg { width: 16px; height: 16px; }
  .web-chat-header-eyebrow { display: none; }
  .web-chat-header p { display: none; }
  .web-chat-header h1 {
    font-size: 1.15rem;
    line-height: 1.05;
    letter-spacing: -0.01em;
  }
  .web-chat-mobile-trigger {
    display: inline-grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 1px solid transparent;
    background: var(--chat-surface-soft);
    color: var(--chat-text-muted);
    cursor: pointer;
    transition: color 0.2s, border-color 0.2s, background 0.2s;
  }
  .web-chat-mobile-trigger:hover,
  .web-chat-mobile-trigger[data-active="true"] {
    color: var(--chat-accent);
    border-color: rgb(from var(--chat-accent) r g b / 0.3);
    background: rgb(from var(--chat-accent) r g b / 0.08);
  }
  .web-chat-mobile-trigger svg { width: 18px; height: 18px; }

  .web-chat-session-rename,
  .web-chat-session-archive,
  .web-chat-session-delete {
    opacity: 1;
    transform: translateY(-50%) scale(1);
  }

  .web-chat-session-dialog-backdrop {
    place-items: end center;
    padding: 1rem;
    padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
  }
  .web-chat-session-dialog {
    width: 100%;
    max-height: calc(100vh - 2rem - env(safe-area-inset-bottom, 0px));
    overflow: auto;
  }

  /* Header CTA buttons → 40px icon-only circles, matching the trigger. */
  .web-chat-header-actions {
    gap: 0.35rem;
  }
  .web-chat-secondary-action {
    width: 40px;
    height: 40px;
    min-height: 40px;
    padding: 0;
    border-radius: 50%;
    font-size: 0;
    gap: 0;
  }
  .web-chat-secondary-action svg { width: 16px; height: 16px; }

  /* Chat surface — full width, tighter spine gutter. */
  .web-chat-shell .web-chat-app { border-left: 0; }
  .web-chat-app {
    max-width: 100%;
    padding: 0.85rem 1rem 0.85rem 1.5rem;
    gap: 1rem;
  }
  .web-chat-app::before { left: 0.6rem; }
  .web-chat-app::after { left: calc(0.6rem - 2px); bottom: 0.85rem; }
  .web-chat-app > .web-chat-conversation,
  .web-chat-app > .web-chat-session-notice,
  .web-chat-app > .web-chat-status,
  .web-chat-app > .web-chat-error,
  .web-chat-app > .web-chat-prompt-input {
    max-width: 100%;
  }

  .web-chat-conversation-content {
    padding: 0.75rem 0.25rem 0.25rem;
    gap: 1.4rem;
  }
  .web-chat-message { max-width: 100%; }

  /* Prompt: bigger touch targets, safe-area inset, iOS no-zoom font size. */
  .web-chat-prompt-input {
    padding-bottom: calc(0.85rem + env(safe-area-inset-bottom, 0px));
  }
  .web-chat-prompt-textarea {
    font-size: 16px;
    min-height: 2.5rem;
  }
  .web-chat-prompt-hint { display: none; }
  .web-chat-prompt-footer { justify-content: flex-end; }
  .web-chat-prompt-submit {
    min-height: 44px;
    min-width: 44px;
  }
}

/* ─── Phone portrait ─── */
@media (max-width: 480px) {
  /* Drop-cap is theatrical at large sizes but overwhelming on narrow
     screens — disable it on the smallest viewports. */
  .web-chat-message[data-role="assistant"]
    .web-chat-message-bubble
    > .web-chat-markdown-response:first-child
    > p:first-of-type::first-letter,
  .web-chat-message[data-role="assistant"]
    .web-chat-message-bubble
    > p:first-of-type::first-letter {
    font-family: inherit;
    font-weight: inherit;
    font-size: inherit;
    float: none;
    line-height: inherit;
    padding: 0;
    color: inherit;
  }
  .web-chat-empty-state { padding: 2.5rem 1rem 1.5rem; gap: 0.55rem; text-align: center; }
  .web-chat-empty-state-glyph { width: 130px; height: 64px; }
  .web-chat-empty-state h2 { font-size: 1.4rem; }
  .web-chat-empty-state p { font-size: 14px; max-width: 26ch; }
  .web-chat-session-dialog-actions { flex-direction: column-reverse; }
  .web-chat-session-dialog-actions button {
    width: 100%;
    min-height: 44px;
  }
}
`;

interface ActiveStream {
  writer: UIMessageStreamWriter<UIMessage>;
}

type OperatorSessionResolver = (request: Request) => Promise<boolean>;

function parseBase64DataUrl(
  dataUrl: string,
  mediaTypePattern: RegExp,
): { mimeType: string; data: ArrayBuffer } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) return null;
  const [, mimeType, encoded] = match;
  if (!mimeType || !encoded || !mediaTypePattern.test(mimeType)) {
    return null;
  }
  const buffer = Buffer.from(encoded, "base64");
  const data = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  return {
    mimeType,
    data,
  };
}

function parsePdfDataUrl(
  dataUrl: string,
): { mimeType: "application/pdf"; data: ArrayBuffer } | null {
  const parsed = parseBase64DataUrl(dataUrl, /^application\/pdf$/i);
  if (parsed?.mimeType.toLowerCase() !== "application/pdf") {
    return null;
  }
  return { mimeType: "application/pdf", data: parsed.data };
}

function parseImageDataUrl(
  dataUrl: string,
): { mimeType: string; data: ArrayBuffer } | null {
  return parseBase64DataUrl(dataUrl, /^image\/[a-z0-9.+-]+$/i);
}

function getDocumentFilename(
  metadata: Record<string, unknown> | null | undefined,
  documentId: string,
): string {
  const filename = metadata?.["filename"];
  return typeof filename === "string" && filename.length > 0
    ? filename
    : `${documentId}.pdf`;
}

function getImageFilename(
  metadata: Record<string, unknown> | null | undefined,
  imageId: string,
  mimeType: string,
): string {
  const filename = metadata?.["filename"];
  if (typeof filename === "string" && filename.length > 0) return filename;

  const format = metadata?.["format"];
  if (typeof format === "string" && format.length > 0) {
    return `${imageId}.${format === "jpeg" ? "jpg" : format}`;
  }

  const subtype = mimeType.split("/")[1];
  return `${imageId}.${subtype && subtype.length > 0 ? subtype : "png"}`;
}

function escapeHeaderValue(value: string): string {
  return value.replace(/["\\\r\n]/g, "_");
}

export interface WebChatDeps {
  /** Override how an operator session is detected (used in tests). */
  resolveOperatorSession?: OperatorSessionResolver;
}

const defaultResolveOperatorSession: OperatorSessionResolver = async (
  request,
) => {
  const authService = getActiveAuthService();
  if (!authService) return false;
  const session = await authService.getOperatorSession(request);
  return session !== undefined;
};

export class WebChatInterface extends MessageInterfacePlugin<WebChatConfig> {
  declare protected config: WebChatConfig;
  private readonly activeStreams = new Map<string, ActiveStream>();
  private readonly resolveOperatorSession: OperatorSessionResolver;

  constructor(config: Partial<WebChatConfig> = {}, deps: WebChatDeps = {}) {
    super("web-chat", packageJson, config, webChatConfigSchema);
    this.resolveOperatorSession =
      deps.resolveOperatorSession ?? defaultResolveOperatorSession;
  }

  protected override async onRegister(
    context: InterfacePluginContext,
  ): Promise<void> {
    await super.onRegister(context);

    context.endpoints.register({
      label: "Chat",
      url: this.config.routePath,
      priority: 15,
      visibility: "anchor",
    });
    context.interactions.register({
      id: "web-chat",
      label: "Chat",
      description: "Chat with this brain in the browser.",
      href: this.config.routePath,
      kind: "human",
      priority: 15,
      visibility: "anchor",
    });
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return [
      {
        path: this.config.routePath,
        method: "GET",
        public: true,
        handler: (request): Promise<Response> => this.handleChatPage(request),
      },
      {
        path: this.config.apiPath,
        method: "POST",
        public: true,
        handler: (request): Promise<Response> =>
          this.handleChatRequest(request),
      },
      {
        path: "/api/chat/sessions",
        method: "GET",
        public: true,
        handler: (request): Promise<Response> =>
          this.handleSessionsRequest(request),
      },
      {
        path: "/api/chat/sessions",
        method: "DELETE",
        public: true,
        handler: (request): Promise<Response> =>
          this.handleDeleteSessionRequest(request),
      },
      {
        path: "/api/chat/sessions",
        method: "PUT",
        public: true,
        handler: (request): Promise<Response> =>
          this.handleRenameSessionRequest(request),
      },
      {
        path: "/api/chat/sessions/archive",
        method: "PUT",
        public: true,
        handler: (request): Promise<Response> =>
          this.handleArchiveSessionRequest(request),
      },
      {
        path: "/api/chat/messages",
        method: "GET",
        public: true,
        handler: (request): Promise<Response> =>
          this.handleMessagesRequest(request),
      },
      {
        path: "/api/chat/attachments/document",
        method: "GET",
        public: true,
        handler: (request): Promise<Response> =>
          this.handleDocumentAttachmentRequest(request),
      },
      {
        path: "/api/chat/attachments/image",
        method: "GET",
        public: true,
        handler: (request): Promise<Response> =>
          this.handleImageAttachmentRequest(request),
      },
      {
        path: "/api/chat/jobs/status",
        method: "GET",
        public: true,
        handler: (request): Promise<Response> =>
          this.handleJobStatusRequest(request),
      },
      {
        path: uiAssetPath,
        method: "GET",
        public: true,
        handler: (): Promise<Response> => this.handleUiAssetRequest(),
      },
      {
        path: "/api/chat/uploads",
        method: "POST",
        public: true,
        handler: (request): Promise<Response> =>
          this.handleUploadRequest(request),
      },
      {
        path: "/api/chat/uploads",
        method: "GET",
        public: true,
        handler: (request): Promise<Response> =>
          this.handleUploadDownloadRequest(request),
      },
    ];
  }

  protected override sendMessageToChannel(
    request: SendMessageToChannelRequest,
  ): void {
    const stream = this.getActiveStream(request.channelId);
    if (!stream) return;
    this.writeText(stream.writer, request.message, "progress");
  }

  protected override async sendMessageWithId(
    request: SendMessageWithIdRequest,
  ): Promise<string | undefined> {
    const stream = this.getActiveStream(request.channelId);
    if (!stream) return undefined;
    return this.writeText(stream.writer, request.message, "progress");
  }

  protected override async editMessage(
    request: EditMessageRequest,
  ): Promise<boolean> {
    const stream = this.getActiveStream(request.channelId);
    if (!stream) return false;
    stream.writer.write({
      type: "data-progress",
      id: request.messageId,
      data: { message: request.newMessage },
      transient: true,
    });
    return true;
  }

  protected override supportsMessageEditing(): boolean {
    return true;
  }

  protected override async handleProgressEvent(
    event: JobProgressEvent,
    _context: JobContext,
  ): Promise<void> {
    const channelId = event.metadata.channelId;
    if (
      event.metadata.interfaceType !== webChatInterfaceType ||
      typeof channelId !== "string"
    ) {
      return;
    }

    const stream = this.getActiveStream(channelId);
    if (!stream) return;

    stream.writer.write({
      type: "data-progress",
      id: `progress:${event.id}`,
      data: this.toProgressData(event),
      transient: event.status === "processing" || event.status === "pending",
    });
  }

  protected override async handleToolActivityEvent(
    event: ToolActivityEvent,
  ): Promise<void> {
    if (
      event.interfaceType !== webChatInterfaceType ||
      typeof event.channelId !== "string"
    ) {
      return;
    }

    const stream = this.getActiveStream(event.channelId);
    if (!stream) return;

    stream.writer.write({
      type: "data-status",
      id: this.createId("tool-status"),
      data: this.toToolStatusData(event),
      transient: true,
    });
  }

  private toProgressData(event: JobProgressEvent): WebChatProgressData {
    const data: WebChatProgressData = {
      type: event.type,
      status: event.status,
      operationType: event.metadata.operationType,
    };
    if (event.metadata.operationTarget) {
      data.operationTarget = event.metadata.operationTarget;
    }
    if (event.message) {
      data.message = event.message;
    }
    if (event.progress) {
      data.progress = event.progress;
    }
    return data;
  }

  private toToolStatusData(event: ToolActivityEvent): WebChatToolStatusData {
    switch (event.type) {
      case "tool:invoking":
        return {
          status: "tool-invoking",
          toolName: event.toolName,
          message: `Using ${event.toolName}…`,
        };
      case "tool:completed":
        return {
          status: "tool-completed",
          toolName: event.toolName,
          message: `Finished ${event.toolName}.`,
        };
      case "tool:failed":
        return {
          status: "tool-failed",
          toolName: event.toolName,
          message: `${event.toolName} failed.`,
          ...(event.error !== undefined && { error: event.error }),
        };
    }
  }

  private async handleChatPage(request: Request): Promise<Response> {
    if (!(await this.resolveOperatorSession(request))) {
      return this.createOperatorLoginRequiredResponse(request);
    }

    return new Response(this.renderChatPage(), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  private async handleUiAssetRequest(): Promise<Response> {
    const file = Bun.file(uiAssetFile);
    if (!(await file.exists())) {
      return new Response("Web chat UI asset not built", { status: 404 });
    }

    return new Response(file, {
      headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  }

  private async handleUploadRequest(request: Request): Promise<Response> {
    if (!(await this.resolveOperatorSession(request))) {
      return new Response("Forbidden", { status: 403 });
    }

    // Reject obviously oversized bodies before buffering the whole upload into
    // memory. Best-effort: Content-Length may be absent, so the post-decode
    // size check below remains authoritative.
    const declaredSize = Number(request.headers.get("content-length"));
    if (
      Number.isFinite(declaredSize) &&
      declaredSize > webChatUploadMaxBytes + webChatUploadEnvelopeSlackBytes
    ) {
      return new Response("File upload too large", { status: 400 });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return new Response("Invalid multipart upload", { status: 400 });
    }

    const file = formData.get(webChatUploadFormField);
    if (!(file instanceof File)) {
      return new Response("Missing upload file", { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const validated = validateWebChatUpload({
      filename: file.name,
      mediaType: file.type,
      content: buffer,
    });
    if (!validated.ok) {
      return new Response(validated.message, { status: 400 });
    }

    const store = this.getUploadStore();
    const record = await store.save({
      filename: validated.filename,
      mediaType: validated.mediaType,
      content: buffer,
    });

    return Response.json(store.toResponseBody(record), { status: 201 });
  }

  private async handleUploadDownloadRequest(
    request: Request,
  ): Promise<Response> {
    if (!(await this.resolveOperatorSession(request))) {
      return new Response("Forbidden", { status: 403 });
    }

    const uploadId = new URL(request.url).searchParams.get("id")?.trim();
    if (!uploadId) {
      return new Response("Missing upload id", { status: 400 });
    }

    const resolved = await this.readStoredUpload(uploadId);
    if (resolved instanceof Response) return resolved;
    const { record, content } = resolved;

    const validated = this.validateStoredUpload(record, content);
    if (validated instanceof Response) return validated;

    const disposition = new URL(request.url).searchParams.has("download")
      ? "attachment"
      : "inline";
    const body = new Uint8Array(content).buffer;
    return new Response(body, {
      headers: {
        "Content-Type": record.mediaType,
        "Content-Length": String(content.byteLength),
        "Content-Disposition": `${disposition}; filename="${escapeHeaderValue(
          record.filename,
        )}"`,
      },
    });
  }

  private async handleChatRequest(request: Request): Promise<Response> {
    if (!(await this.resolveOperatorSession(request))) {
      return new Response("Forbidden", { status: 403 });
    }
    const permissionLevel = "anchor";

    const body = await request.json();
    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response("Invalid chat request", { status: 400 });
    }

    const conversationId = parsed.data.id ?? this.createId("web");
    const approvalResponses = this.extractLatestApprovalResponses(parsed.data);

    const userInput =
      approvalResponses.length === 0
        ? await this.extractLastUserInput(parsed.data, conversationId)
        : { message: "", attachments: [] };
    if (userInput instanceof Response) return userInput;
    const { message, attachments, responseText } = userInput;
    const hasUserInput = message.length > 0 || attachments.length > 0;
    if (!hasUserInput && approvalResponses.length === 0) {
      return new Response("No user message found", { status: 400 });
    }

    const stream = createUIMessageStream<UIMessage>({
      execute: async ({ writer }) => {
        if (approvalResponses.length > 0) {
          await this.handleStreamedConfirmations({
            writer,
            conversationId,
            approvalResponses,
          });
          return;
        }

        if (responseText !== undefined) {
          this.writeText(writer, responseText, "text");
          return;
        }

        await this.handleStreamedChat({
          writer,
          conversationId,
          message,
          permissionLevel,
          attachments,
        });
      },
    });

    return createUIMessageStreamResponse({ stream });
  }

  private async handleSessionsRequest(request: Request): Promise<Response> {
    const permissionLevel = await this.resolvePermissionLevel(request);
    if (permissionLevel !== "anchor") {
      return new Response("Forbidden", { status: 403 });
    }

    const conversations = await this.getContext().conversations.list({
      interfaceType: webChatInterfaceType,
      limit: webChatSessionLimit,
    });
    const activeConversations = conversations.filter(
      (conversation) => !this.isArchivedMetadata(conversation.metadata),
    );
    const sessions = await Promise.all(
      activeConversations.map(async (conversation) => ({
        id: conversation.id,
        title: await this.getConversationTitle(conversation.id),
        lastActiveAt: conversation.lastActiveAt,
      })),
    );

    return Response.json({ sessions });
  }

  private async handleDeleteSessionRequest(
    request: Request,
  ): Promise<Response> {
    const permissionLevel = await this.resolvePermissionLevel(request);
    if (permissionLevel !== "anchor") {
      return new Response("Forbidden", { status: 403 });
    }

    const conversation = await this.resolveWebChatSession(request);
    if (conversation instanceof Response) return conversation;

    const deleted = await this.getContext().conversations.delete(
      conversation.id,
    );
    return Response.json({ deleted });
  }

  private async handleRenameSessionRequest(
    request: Request,
  ): Promise<Response> {
    const permissionLevel = await this.resolvePermissionLevel(request);
    if (permissionLevel !== "anchor") {
      return new Response("Forbidden", { status: 403 });
    }

    const conversation = await this.resolveWebChatSession(request);
    if (conversation instanceof Response) return conversation;

    const parsed = renameSessionRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return new Response("Invalid rename request", { status: 400 });
    }

    const renamed = await this.getContext().conversations.updateMetadata({
      conversationId: conversation.id,
      metadata: { title: parsed.data.title },
    });

    return Response.json({ renamed, title: parsed.data.title });
  }

  private async handleArchiveSessionRequest(
    request: Request,
  ): Promise<Response> {
    const permissionLevel = await this.resolvePermissionLevel(request);
    if (permissionLevel !== "anchor") {
      return new Response("Forbidden", { status: 403 });
    }

    const conversation = await this.resolveWebChatSession(request);
    if (conversation instanceof Response) return conversation;

    const archived = await this.getContext().conversations.updateMetadata({
      conversationId: conversation.id,
      metadata: { archivedAt: new Date().toISOString() },
    });

    return Response.json({ archived });
  }

  private async resolveWebChatSession(
    request: Request,
  ): Promise<WebChatConversation | Response> {
    const conversationId = new URL(request.url).searchParams.get("id");
    if (!conversationId) {
      return new Response("Missing conversation id", { status: 400 });
    }

    const conversation =
      await this.getContext().conversations.get(conversationId);
    if (conversation?.interfaceType !== webChatInterfaceType) {
      return new Response("Conversation not found", { status: 404 });
    }

    return conversation;
  }

  private async getConversationTitle(conversationId: string): Promise<string> {
    const conversation =
      await this.getContext().conversations.get(conversationId);
    const renamedTitle = this.getMetadataTitle(conversation?.metadata);
    if (renamedTitle) return renamedTitle;

    const messages = await this.getContext().conversations.getMessages(
      conversationId,
      { limit: webChatTitleMessageLimit },
    );
    const firstUserMessage = messages.find(
      (message) => message.role === "user" && message.content.trim().length > 0,
    );
    if (!firstUserMessage) return "New conversation";

    const firstLine =
      firstUserMessage.content.trim().split(/\r?\n/, 1)[0] ?? "";
    if (firstLine.length <= webChatTitleMaxLength) return firstLine;
    return `${firstLine.slice(0, webChatTitleMaxLength - 1).trimEnd()}…`;
  }

  private isArchivedMetadata(metadata: unknown): boolean {
    return (
      typeof coerceConversationMetadata(metadata)["archivedAt"] === "string"
    );
  }

  private getMetadataTitle(metadata: unknown): string | undefined {
    const title = coerceConversationMetadata(metadata)["title"];
    return typeof title === "string" && title.trim().length > 0
      ? title
      : undefined;
  }

  private async handleDocumentAttachmentRequest(
    request: Request,
  ): Promise<Response> {
    if (!(await this.resolveOperatorSession(request))) {
      return this.createOperatorLoginRequiredResponse(request);
    }

    const url = new URL(request.url);
    const documentId = url.searchParams.get("id")?.trim();
    if (!documentId) {
      return new Response("Missing document id", { status: 400 });
    }

    const document = await this.getContext().entityService.getEntity({
      entityType: "document",
      id: documentId,
    });
    if (!document) {
      return new Response("Document not found", { status: 404 });
    }

    const parsed = parsePdfDataUrl(document.content);
    if (!parsed) {
      return new Response("Document content is not a PDF", { status: 415 });
    }

    const filename = getDocumentFilename(document.metadata, documentId);
    return this.createBinaryAttachmentResponse({
      requestUrl: url,
      data: parsed.data,
      mediaType: parsed.mimeType,
      filename,
    });
  }

  private async handleImageAttachmentRequest(
    request: Request,
  ): Promise<Response> {
    if (!(await this.resolveOperatorSession(request))) {
      return this.createOperatorLoginRequiredResponse(request);
    }

    const url = new URL(request.url);
    const imageId = url.searchParams.get("id")?.trim();
    if (!imageId) {
      return new Response("Missing image id", { status: 400 });
    }

    const image = await this.getContext().entityService.getEntity({
      entityType: "image",
      id: imageId,
    });
    if (!image) {
      return new Response("Image not found", { status: 404 });
    }

    const parsed = parseImageDataUrl(image.content);
    if (!parsed) {
      return new Response("Image content is not an image", { status: 415 });
    }

    const filename = getImageFilename(image.metadata, imageId, parsed.mimeType);
    return this.createBinaryAttachmentResponse({
      requestUrl: url,
      data: parsed.data,
      mediaType: parsed.mimeType,
      filename,
    });
  }

  private createBinaryAttachmentResponse(input: {
    requestUrl: URL;
    data: ArrayBuffer;
    mediaType: string;
    filename: string;
  }): Response {
    const headers = new Headers({
      "Content-Type": input.mediaType,
      "Content-Length": String(input.data.byteLength),
      "Content-Disposition": `${
        input.requestUrl.searchParams.has("download") ? "attachment" : "inline"
      }; filename="${escapeHeaderValue(input.filename)}"`,
    });
    return new Response(input.data, { headers });
  }

  private async handleJobStatusRequest(request: Request): Promise<Response> {
    if (!(await this.resolveOperatorSession(request))) {
      return this.createOperatorLoginRequiredResponse(request);
    }

    const url = new URL(request.url);
    const jobId = url.searchParams.get("id")?.trim();
    if (!jobId) {
      return new Response("Missing job id", { status: 400 });
    }

    const job = await this.getContext().jobs.getStatus(jobId);
    if (!job) {
      return new Response("Job not found", { status: 404 });
    }

    return Response.json({
      id: job.id,
      status: job.status,
      message: job.lastError ?? undefined,
    });
  }

  private async handleMessagesRequest(request: Request): Promise<Response> {
    const permissionLevel = await this.resolvePermissionLevel(request);
    if (permissionLevel !== "anchor") {
      return new Response("Forbidden", { status: 403 });
    }

    const conversationId = new URL(request.url).searchParams.get("id");
    if (!conversationId) {
      return new Response("Missing conversation id", { status: 400 });
    }

    const conversation =
      await this.getContext().conversations.get(conversationId);
    if (conversation?.interfaceType !== webChatInterfaceType) {
      return new Response("Conversation not found", { status: 404 });
    }

    const messages = await this.getContext().conversations.getMessages(
      conversationId,
      { limit: 100 },
    );

    return Response.json({
      messages: messages.map((message) => {
        const attachments = this.getStoredMessageAttachments(
          message.metadata,
          message.timestamp,
        );
        const cards = this.getStoredMessageCards(message.metadata);
        return {
          id: message.id,
          role: message.role,
          content: stripInternalEntityMemoryNote(message.content),
          ...(attachments.length > 0 ? { attachments } : {}),
          ...(cards.length > 0 ? { cards } : {}),
        };
      }),
    });
  }

  private getStoredMessageAttachments(
    metadata: unknown,
    createdAt: string,
  ): Array<{
    kind: "text";
    filename: string;
    mediaType: string;
    sizeBytes: number;
    createdAt: string;
    source?: { kind: string; id: string } | undefined;
  }> {
    const parsedMetadata = this.parseStoredMessageMetadata(metadata);
    const parsedAttachments = storedChatAttachmentsSchema.safeParse(
      parsedMetadata?.["attachments"],
    );
    if (!parsedAttachments.success) return [];

    return parsedAttachments.data.map((attachment) => ({
      kind: attachment.kind,
      filename: attachment.filename,
      mediaType: attachment.mediaType,
      sizeBytes: attachment.sizeBytes ?? 0,
      createdAt,
      ...(attachment.source !== undefined && { source: attachment.source }),
    }));
  }

  private getStoredMessageCards(metadata: unknown): StructuredChatCard[] {
    const parsedMetadata = this.parseStoredMessageMetadata(metadata);
    const parsedCards = storedChatCardsSchema.safeParse(
      parsedMetadata?.["cards"],
    );
    if (!parsedCards.success) return [];
    return parsedCards.data;
  }

  private parseStoredMessageMetadata(
    metadata: unknown,
  ): Record<string, unknown> | null {
    if (typeof metadata === "string") {
      try {
        const parsed = JSON.parse(metadata) as unknown;
        return this.isRecord(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
    return this.isRecord(metadata) ? metadata : null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private async handleStreamedChat(input: {
    writer: UIMessageStreamWriter<UIMessage>;
    conversationId: string;
    message: string;
    permissionLevel: "anchor" | "public";
    attachments: ChatAttachment[];
  }): Promise<void> {
    this.activeStreams.set(input.conversationId, { writer: input.writer });
    this.startProcessingInput(input.conversationId);
    input.writer.write({
      type: "data-status",
      id: this.createId("status"),
      data: { status: "thinking" },
      transient: true,
    });

    try {
      const response = await this.getContext().agent.chat(
        input.message,
        input.conversationId,
        {
          userPermissionLevel: input.permissionLevel,
          interfaceType: webChatInterfaceType,
          channelId: input.conversationId,
          channelName: "Web Chat",
          attachments: input.attachments,
        },
      );

      this.writeText(input.writer, response.text, "text");
      for (const toolResult of response.toolResults ?? []) {
        input.writer.write({
          type: "data-tool-result",
          id: this.createId("tool"),
          data: toolResult,
        });
      }
      this.writeStructuredCards(input.writer, response.cards ?? []);
    } finally {
      this.endProcessingInput();
      this.activeStreams.delete(input.conversationId);
    }
  }

  private async handleStreamedConfirmations(input: {
    writer: UIMessageStreamWriter<UIMessage>;
    conversationId: string;
    approvalResponses: ApprovalResponse[];
  }): Promise<void> {
    this.activeStreams.set(input.conversationId, { writer: input.writer });
    this.startProcessingInput(input.conversationId);
    const allApproved = input.approvalResponses.every(
      (approvalResponse) => approvalResponse.approved,
    );
    input.writer.write({
      type: "data-status",
      id: this.createId("status"),
      data: { status: allApproved ? "approving" : "resolving approvals" },
      transient: true,
    });

    try {
      for (const approvalResponse of input.approvalResponses) {
        const response = await this.getContext().agent.confirmPendingAction(
          input.conversationId,
          approvalResponse.approved,
          approvalResponse.id,
        );
        this.writeText(input.writer, response.text, "text");
        this.writeStructuredCards(input.writer, response.cards ?? []);
      }
    } finally {
      this.endProcessingInput();
      this.activeStreams.delete(input.conversationId);
    }
  }

  private writeStructuredCards(
    writer: UIMessageStreamWriter<UIMessage>,
    cards: StructuredChatCard[],
  ): void {
    for (const card of cards) {
      if (card.kind === "attachment") {
        writer.write({
          type: "data-attachment",
          id: card.id,
          data: card,
        });
        continue;
      }

      const toolCallId = card.toolCallId ?? card.id;
      const input = card.input ?? {};
      writer.write({
        type: "tool-input-available",
        toolCallId,
        toolName: card.toolName,
        input,
        dynamic: true,
        title: card.preview
          ? `${card.summary}\n\n${card.preview}`
          : card.summary,
      });
      switch (card.state) {
        case "approval-requested":
          writer.write({
            type: "tool-approval-request",
            approvalId: card.id,
            toolCallId,
          });
          break;
        case "approval-responded":
          // Agent skips this state — it transitions directly from
          // approval-requested to one of the output-* states.
          break;
        case "output-available":
          writer.write({
            type: "tool-output-available",
            toolCallId,
            output: card.output,
            dynamic: true,
          });
          break;
        case "output-error":
          writer.write({
            type: "tool-output-error",
            toolCallId,
            errorText: card.error ?? "Tool failed",
            dynamic: true,
          });
          break;
        case "output-denied":
          writer.write({
            type: "tool-output-denied",
            toolCallId,
          });
          break;
      }
    }
  }

  private getActiveStream(channelId: string | null): ActiveStream | undefined {
    if (!channelId) return undefined;
    return this.activeStreams.get(channelId);
  }

  private async resolvePermissionLevel(
    request: Request,
  ): Promise<"anchor" | "public"> {
    return (await this.resolveOperatorSession(request)) ? "anchor" : "public";
  }

  private createOperatorLoginRequiredResponse(request: Request): Response {
    const authService = getActiveAuthService();
    if (authService) return authService.createOperatorLoginResponse(request);

    return new Response("Operator login required", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  private async extractLastUserInput(
    request: ChatRequest,
    conversationId: string,
  ): Promise<ParsedUserInput | Response> {
    const lastUserMessage = this.findLastUserMessage(request);
    if (!lastUserMessage) return { message: "", attachments: [] };

    const messageParts: string[] = [];
    const attachments: ChatAttachment[] = [];
    for (const part of lastUserMessage.parts ?? []) {
      const parsedText = textPartSchema.safeParse(part);
      if (parsedText.success) {
        if (parsedText.data.text.length > 0) {
          messageParts.push(parsedText.data.text);
        }
        continue;
      }

      const parsedFile = filePartSchema.safeParse(part);
      if (parsedFile.success) {
        const attachment = this.resolveInlineUploadPart(parsedFile.data);
        if (attachment instanceof Response) return attachment;
        attachments.push(attachment);
        continue;
      }

      const parsedUploadRef = uploadRefPartSchema.safeParse(part);
      if (parsedUploadRef.success) {
        const attachment = await this.resolveReferencedUpload(
          parsedUploadRef.data.data.ref.id,
        );
        if (attachment instanceof Response) return attachment;
        attachments.push(attachment);
        continue;
      }

      if (this.getPartType(part) === "data-upload") {
        return new Response("Invalid upload ref", { status: 400 });
      }
    }

    const message =
      messageParts.length > 0
        ? messageParts.join("\n\n")
        : (lastUserMessage.content ?? "");

    if (attachments.length === 0) {
      const deferred = await this.resolveDeferredUploadReference(
        request,
        conversationId,
        lastUserMessage,
        message,
      );
      if (deferred instanceof Response) return deferred;
      if (deferred !== null) return { message, ...deferred };
    }

    return {
      message,
      attachments,
    };
  }

  private async resolveDeferredUploadReference(
    request: ChatRequest,
    conversationId: string,
    lastUserMessage: ChatRequest["messages"][number],
    message: string,
  ): Promise<Pick<ParsedUserInput, "attachments" | "responseText"> | null> {
    const intent = this.getDeferredUploadIntent(message);
    if (intent === null) return null;

    const uploadIds = await this.collectPriorUploadIds(
      request,
      conversationId,
      lastUserMessage,
    );
    const candidates: ChatAttachment[] = [];
    for (const uploadId of uploadIds) {
      const attachment = await this.resolveReferencedUpload(uploadId);
      if (attachment instanceof Response) continue;
      if (this.matchesDeferredUploadIntent(attachment, intent)) {
        candidates.push(attachment);
      }
    }

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return { attachments: candidates };

    return {
      attachments: [],
      responseText: `Which upload should I use? ${candidates
        .map((candidate) => `\`${candidate.filename}\``)
        .join(", ")}`,
    };
  }

  private getDeferredUploadIntent(
    message: string,
  ): DeferredUploadIntent | null {
    const normalized = message.toLowerCase();
    const hasAction =
      /\b(describe|summari[sz]e|read|analy[sz]e|inspect|review|explain)\b/.test(
        normalized,
      ) || /\b(?:what(?:'s| is)|tell me)\b/.test(normalized);
    if (!hasAction) return null;

    if (/\b(image|picture|photo|pic|screenshot)\b/.test(normalized)) {
      return "image";
    }
    if (/\bpdf\b/.test(normalized)) return "pdf";
    if (/\b(file|attachment|upload|it|that|this)\b/.test(normalized)) {
      return "upload";
    }

    return null;
  }

  private async collectPriorUploadIds(
    request: ChatRequest,
    conversationId: string,
    lastUserMessage: ChatRequest["messages"][number],
  ): Promise<string[]> {
    const ids: string[] = [];
    const seen = new Set<string>();
    const add = (uploadId: string): void => {
      if (seen.has(uploadId)) return;
      seen.add(uploadId);
      ids.push(uploadId);
    };

    const lastUserIndex = request.messages.indexOf(lastUserMessage);
    const priorMessages = request.messages.slice(
      0,
      lastUserIndex === -1 ? request.messages.length : lastUserIndex,
    );
    for (const message of priorMessages) {
      if (message.role !== "user") continue;
      for (const part of message.parts ?? []) {
        const parsedUploadRef = uploadRefPartSchema.safeParse(part);
        if (parsedUploadRef.success) {
          add(parsedUploadRef.data.data.ref.id);
        }
      }
    }

    const storedMessages = await this.getContext().conversations.getMessages(
      conversationId,
      { limit: 50 },
    );
    for (const message of storedMessages) {
      if (message.role !== "user") continue;
      const parsedMetadata = this.parseStoredMessageMetadata(message.metadata);
      const attachments = parsedMetadata?.["attachments"];
      if (!Array.isArray(attachments)) continue;
      for (const attachment of attachments) {
        if (!this.isRecord(attachment)) continue;
        const source = attachment["source"];
        if (!this.isRecord(source)) continue;
        if (source["kind"] !== webChatUploadRefKind) continue;
        const uploadId = source["id"];
        if (
          typeof uploadId === "string" &&
          webChatUploadIdPattern.test(uploadId)
        ) {
          add(uploadId);
        }
      }
    }

    return ids;
  }

  private matchesDeferredUploadIntent(
    attachment: ChatAttachment,
    intent: DeferredUploadIntent,
  ): boolean {
    if (intent === "upload") return true;
    if (intent === "image") return attachment.mediaType.startsWith("image/");
    return (
      attachment.mediaType === "application/pdf" ||
      attachment.filename.toLowerCase().endsWith(".pdf")
    );
  }

  private getPartType(part: unknown): string | undefined {
    if (typeof part !== "object" || part === null || !("type" in part)) {
      return undefined;
    }
    const type = part.type;
    return typeof type === "string" ? type : undefined;
  }

  private resolveInlineUploadPart(
    file: z.infer<typeof filePartSchema>,
  ): ChatAttachment | Response {
    const filename = sanitizeUploadFilename(
      file.filename ?? defaultWebChatUploadFilename,
    );
    const decoded = this.decodeUploadedDataUrl(file.url);
    if (!decoded) {
      return new Response(`Unsupported file upload URL: ${filename}`, {
        status: 400,
      });
    }

    const validated = validateWebChatUpload({
      filename,
      mediaType: file.mediaType,
      content: decoded.buffer,
    });
    if (!validated.ok) {
      return new Response(validated.message, { status: 400 });
    }

    return this.toChatAttachment(validated, decoded.buffer);
  }

  private async resolveReferencedUpload(
    uploadId: string,
  ): Promise<ChatAttachment | Response> {
    const resolved = await this.readStoredUpload(uploadId);
    if (resolved instanceof Response) return resolved;

    const { record, content } = resolved;
    const validated = this.validateStoredUpload(record, content);
    if (validated instanceof Response) return validated;

    return this.toChatAttachment(validated, content, {
      kind: webChatUploadRefKind,
      id: uploadId,
    });
  }

  private getUploadStore(): WebChatUploadStore {
    return new WebChatUploadStore({ dataDir: this.getUploadRuntimeDataDir() });
  }

  private getUploadRuntimeDataDir(): string {
    const contentDataDir = this.getContext().dataDir;
    return basename(contentDataDir) === "brain-data"
      ? join(dirname(contentDataDir), "data")
      : contentDataDir;
  }

  private async readStoredUpload(
    uploadId: string,
  ): Promise<ResolvedWebChatUpload | Response> {
    try {
      return await this.getUploadStore().read(uploadId);
    } catch (error) {
      if (error instanceof WebChatUploadStoreError) {
        return this.uploadStoreErrorToResponse(error);
      }
      throw error;
    }
  }

  private validateStoredUpload(
    record: WebChatUploadRecord,
    content: Buffer,
  ): ValidatedWebChatUpload | Response {
    const validated = validateWebChatUpload({
      filename: record.filename,
      mediaType: record.mediaType,
      content,
    });
    if (!validated.ok) {
      return new Response(validated.message, { status: 400 });
    }
    return validated;
  }

  private toChatAttachment(
    upload: ValidatedWebChatUpload,
    content: Uint8Array,
    source?: ChatAttachment["source"],
  ): ChatAttachment {
    if (upload.kind === "text") {
      return {
        kind: "text",
        filename: upload.filename,
        mediaType: upload.mediaType,
        content: upload.text,
        sizeBytes: upload.sizeBytes,
        ...(source !== undefined ? { source } : {}),
      };
    }

    return {
      kind: "file",
      filename: upload.filename,
      mediaType: upload.mediaType,
      data: new Uint8Array(content),
      sizeBytes: upload.sizeBytes,
      ...(source !== undefined ? { source } : {}),
    };
  }

  private uploadStoreErrorToResponse(error: WebChatUploadStoreError): Response {
    switch (error.code) {
      case "invalid_ref":
        return new Response("Invalid upload ref", { status: 400 });
      case "invalid_metadata":
        return new Response("Invalid upload metadata", { status: 500 });
      case "not_found":
        return new Response("Upload not found", { status: 404 });
    }
  }

  private decodeUploadedDataUrl(
    url: string,
  ): { buffer: Buffer; byteLength: number } | null {
    const match = /^data:[^,]*,(.*)$/s.exec(url);
    if (!match) return null;

    const metadata = url.slice(5, url.indexOf(","));
    const isBase64 = metadata
      .split(";")
      .some((part) => part.toLowerCase() === "base64");
    try {
      const buffer = isBase64
        ? Buffer.from(match[1] ?? "", "base64")
        : Buffer.from(decodeURIComponent(match[1] ?? ""), "utf8");
      return { buffer, byteLength: buffer.byteLength };
    } catch {
      return null;
    }
  }

  private extractLatestApprovalResponses(
    request: ChatRequest,
  ): ApprovalResponse[] {
    // Clients resend the full message history on every turn, but only the
    // trailing assistant message carries this turn's approval responses.
    // Scanning earlier messages would replay decisions the agent already
    // executed.
    const lastMessage = request.messages.at(-1);
    if (!lastMessage || lastMessage.role === "user") return [];

    return (lastMessage.parts ?? [])
      .map((part) => approvalResponsePartSchema.safeParse(part))
      .filter((result) => result.success)
      .map((result) => result.data.approval);
  }

  private findLastUserMessage(
    request: ChatRequest,
  ): ChatRequest["messages"][number] | undefined {
    for (let index = request.messages.length - 1; index >= 0; index -= 1) {
      const message = request.messages[index];
      if (message?.role === "user") return message;
    }
    return undefined;
  }

  private writeText(
    writer: UIMessageStreamWriter<UIMessage>,
    text: string,
    prefix: string,
  ): string {
    const id = this.createId(prefix);
    writer.write({ type: "text-start", id });
    writer.write({ type: "text-delta", id, delta: text });
    writer.write({ type: "text-end", id });
    return id;
  }

  private renderChatPage(): string {
    // Inline theme-init script runs before first paint to set
    // data-theme on <html> based on a stored choice or prefers-color-scheme.
    // The chat tokens key off this attribute (see chatPageStyles).
    const themeInit = `(function(){try{var s=localStorage.getItem('brain:theme');var p=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';document.documentElement.setAttribute('data-theme',s||p);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;
    return `<!doctype html><html lang="en" data-theme="dark" data-theme-profile="product"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Brain Chat</title><script>${themeInit}</script><style data-web-chat-styles>${chatPageStyles}</style></head><body><main id="root" data-web-chat-root>Brain Chat</main><script type="module" src="${uiAssetPath}"></script></body></html>`;
  }

  private createId(prefix: string): string {
    return `${prefix}-${crypto.randomUUID()}`;
  }
}
