import { getActiveAuthService } from "@brains/auth-service";
import {
  MessageInterfacePlugin,
  type EditMessageRequest,
  type InterfacePluginContext,
  type SendMessageToChannelRequest,
  type SendMessageWithIdRequest,
  type WebRouteDefinition,
} from "@brains/plugins";
import { z } from "@brains/utils";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageStreamWriter,
} from "ai";
import { join } from "path";
import packageJson from "../package.json";
import { webChatConfigSchema, type WebChatConfig } from "./config";

const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const uiMessageSchema = z.object({
  role: z.string(),
  parts: z.array(z.unknown()).optional(),
  content: z.string().optional(),
});

const chatRequestSchema = z.object({
  id: z.string().optional(),
  messages: z.array(uiMessageSchema).min(1),
});

const confirmationRequestSchema = z.object({
  id: z.string(),
  confirmed: z.boolean(),
});

const webChatInterfaceType = "web-chat";
const webChatSessionLimit = 25;
const webChatTitleMessageLimit = 6;
const webChatTitleMaxLength = 48;

type ChatRequest = z.infer<typeof chatRequestSchema>;

const uiAssetPath = "/chat/assets/app.js";
const uiAssetFile = join(import.meta.dir, "..", "dist", "ui", "app.js");
/* Rizom-flavored chat styling. Mirrors interfaces/web-chat/mockup.html;
   keep both in sync if you iterate on either. */
const chatPageStyles = `
:root {
  --palette-bg-deep: #0d0a1a;
  --palette-bg-subtle: #0e0b1e;
  --palette-bg-card: #1a0a3e;
  --palette-amber-dark: #c45a08;
  --palette-amber: #e87722;
  --palette-amber-light: #ffa366;
  --palette-purple: #6b2fa0;
  --palette-purple-light: #8c82c8;
  --palette-purple-muted: #818cf8;
  --palette-white: #ffffff;

  --color-bg: var(--palette-bg-deep);
  --color-bg-subtle: var(--palette-bg-subtle);
  --color-bg-card: var(--palette-bg-card);
  --color-text: var(--palette-white);
  --color-text-muted: rgb(255 255 255 / 0.6);
  --color-text-light: rgb(255 255 255 / 0.4);
  --color-accent: var(--palette-amber-light);
  --color-accent-dark: var(--palette-amber);
  --color-secondary: var(--palette-purple-muted);
  --color-on-accent: var(--palette-bg-deep);
  --color-border: rgb(255 255 255 / 0.1);
  --color-border-light: rgb(255 255 255 / 0.04);
  --color-success: #4ade80;
  --color-error: #f87171;

  --color-glow-cta: rgb(255 163 102 / 0.3);
  --color-glow-cta-strong: rgb(255 163 102 / 0.45);

  --font-display: "Fraunces", Georgia, serif;
  --font-body: "Barlow", system-ui, sans-serif;
  --font-label: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

  --bg-noise: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
  --bg-ember: radial-gradient(ellipse at 18% -10%, rgb(255 163 102 / 0.08) 0%, transparent 55%),
              radial-gradient(ellipse at 90% 110%, rgb(140 130 200 / 0.06) 0%, transparent 45%);

  color-scheme: dark;
}

* { box-sizing: border-box; }
html, body, #root { height: 100%; }
body {
  margin: 0;
  background-color: var(--color-bg);
  background-image: var(--bg-ember), var(--bg-noise);
  color: var(--color-text);
  font-family: var(--font-body);
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
.web-chat-shell .web-chat-app { border-left: 1px solid var(--color-border-light); }

/* ─── Chat surface ─── */
.web-chat-app {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  gap: 1.25rem;
  min-width: 0;
  min-height: 0;
  padding: 1.25rem 1.5rem 1.5rem;
}
/* Header, status, prompt, and error are indented to align with the
   message column inside .web-chat-conversation-content (which has
   padding-left: 2.75rem to make room for the spine). Keeps the whole
   chat surface reading as a single coherent column. */
.web-chat-app > .web-chat-header,
.web-chat-app > .web-chat-status,
.web-chat-app > .web-chat-error,
.web-chat-app > .web-chat-prompt-input {
  margin-left: 2.75rem;
}

/* ── Header ── */
.web-chat-header {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 1rem;
}
.web-chat-header-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  margin-bottom: 0.5rem;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.web-chat-header-eyebrow::before {
  content: "";
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--color-accent);
  box-shadow: 0 0 10px rgb(from var(--color-accent) r g b / 0.7);
}
.web-chat-header-eyebrow strong {
  color: var(--color-text);
  font-weight: 600;
}
.web-chat-header h1 {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 520;
  font-size: clamp(2rem, 3.4vw, 2.75rem);
  line-height: 1;
  letter-spacing: -0.025em;
}
.web-chat-header h1 em {
  font-style: italic;
  font-weight: 400;
  color: var(--color-accent);
}
.web-chat-header p {
  margin: 0.55rem 0 0;
  color: var(--color-text-muted);
  font-family: var(--font-display);
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
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.04);
  color: var(--color-text);
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
}
.web-chat-secondary-action:hover {
  border-color: rgb(255 255 255 / 0.4);
  background: rgb(255 255 255 / 0.08);
}
.web-chat-secondary-action svg { width: 12px; height: 12px; }

/* ─── Sessions panel ─── */
.web-chat-sessions {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  padding: 1.25rem 0 1.5rem;
  min-height: 0;
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
  font-family: var(--font-display);
  font-weight: 520;
  font-size: 1.05rem;
  letter-spacing: -0.01em;
  color: var(--color-text);
}
.web-chat-sessions-header h2 em {
  font-style: italic;
  font-weight: 400;
  color: var(--color-accent);
}
.web-chat-sessions-new {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px; height: 28px;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: rgb(from var(--color-accent) r g b / 0.1);
  color: var(--color-accent);
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease, border-color 0.2s ease;
}
.web-chat-sessions-new:hover {
  background: rgb(from var(--color-accent) r g b / 0.18);
  border-color: var(--color-accent);
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
    rgb(from var(--color-secondary) r g b / 0.18) 6%,
    rgb(from var(--color-secondary) r g b / 0.28) 90%,
    transparent 100%);
  pointer-events: none;
}
.web-chat-sessions-list-empty {
  margin: 1rem 1.25rem;
  color: var(--color-text-light);
  font-family: var(--font-display);
  font-style: italic;
  font-size: 13px;
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
  padding: 0.75rem 1.25rem 0.75rem 0.85rem;
  cursor: pointer;
  text-align: left;
  color: inherit;
  transition: background 0.2s ease;
}
.web-chat-session:hover { background: rgb(255 255 255 / 0.02); }
.web-chat-session-time {
  padding-top: 0.15rem;
  font-family: var(--font-label);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-text-light);
  text-align: right;
}
.web-chat-session::before {
  content: "";
  position: absolute;
  left: calc(4.25rem - 5px);
  top: 0.9rem;
  width: 11px; height: 11px;
  border-radius: 50%;
  background: var(--palette-bg-card);
  box-shadow:
    inset 0 0 0 2px rgb(from var(--color-secondary) r g b / 0.65),
    0 0 0 3px var(--palette-bg-card);
  z-index: 1;
  transition: box-shadow 0.2s ease;
}
.web-chat-session:hover::before {
  box-shadow:
    inset 0 0 0 2px var(--color-secondary),
    0 0 0 3px var(--palette-bg-card),
    0 0 10px rgb(from var(--color-secondary) r g b / 0.5);
}
.web-chat-session::after {
  content: "";
  position: absolute;
  left: calc(4.25rem + 6px);
  top: 1.3rem;
  width: calc(1.6rem - 6px);
  height: 1px;
  background: linear-gradient(90deg, rgb(from var(--color-secondary) r g b / 0.4), transparent);
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
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.35;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
}
.web-chat-session[data-active="true"] {
  background: linear-gradient(90deg,
    rgb(from var(--color-accent) r g b / 0.08) 0%,
    rgb(from var(--color-accent) r g b / 0.02) 100%);
}
.web-chat-session[data-active="true"]::before {
  background: var(--color-accent);
  box-shadow:
    0 0 0 3px var(--palette-bg-card),
    0 0 14px rgb(from var(--color-accent) r g b / 0.6);
}
.web-chat-session[data-active="true"]::after {
  background: linear-gradient(90deg,
    rgb(from var(--color-accent) r g b / 0.6),
    rgb(from var(--color-accent) r g b / 0.2));
}
.web-chat-session[data-active="true"] .web-chat-session-time { color: var(--color-accent); }

.web-chat-sessions-footer {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.85rem 1.25rem 0;
  border-top: 1px solid var(--color-border-light);
  margin-top: 0.5rem;
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-text-light);
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
  background: var(--color-success);
  box-shadow: 0 0 6px rgb(from var(--color-success) r g b / 0.6);
}

/* ─── Conversation (mycelial spine) ─── */
.web-chat-conversation {
  min-height: 0;
  overflow: auto;
  padding: 0.25rem;
}
.web-chat-conversation::-webkit-scrollbar { width: 8px; }
.web-chat-conversation::-webkit-scrollbar-thumb {
  background: rgb(255 255 255 / 0.08);
  border-radius: 999px;
}
.web-chat-conversation-content {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2rem;
  min-width: 0;
  min-height: 100%;
  padding: 1.25rem 0.5rem 0.5rem 2.75rem;
}
.web-chat-conversation-content::before {
  content: "";
  position: absolute;
  left: 1.25rem; top: 0; bottom: 0;
  width: 1px;
  background: linear-gradient(180deg,
    transparent 0%,
    rgb(from var(--color-secondary) r g b / 0.25) 6%,
    rgb(from var(--color-secondary) r g b / 0.35) 50%,
    rgb(from var(--color-accent) r g b / 0.25) 94%,
    transparent 100%);
  pointer-events: none;
}
.web-chat-conversation-content::after {
  content: "";
  position: absolute;
  left: calc(1.25rem - 2px);
  bottom: -1px;
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--color-accent);
  box-shadow: 0 0 12px rgb(from var(--color-accent) r g b / 0.7);
  opacity: 0.85;
}

/* ─── Empty state — anchored at the spine where the first message
   would land, not floated in the middle of the pane. ─── */
.web-chat-empty-state {
  margin: 0;
  max-width: 38rem;
  padding: 1rem 1.5rem 1rem 0;
  color: var(--color-text-muted);
  display: grid;
  gap: 1.25rem;
  justify-items: start;
  text-align: left;
}
.web-chat-empty-state-glyph {
  width: 180px;
  height: 88px;
  overflow: visible;
  color: var(--color-secondary);
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
  fill: var(--color-accent);
  opacity: 0;
  animation: web-chat-rhizome-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  filter: drop-shadow(0 0 4px var(--color-accent));
}
.web-chat-empty-state-glyph circle:nth-of-type(1) { animation-delay: 1.0s; }
.web-chat-empty-state-glyph circle:nth-of-type(2) { animation-delay: 1.3s; fill: var(--color-secondary); filter: drop-shadow(0 0 4px var(--color-secondary)); }
.web-chat-empty-state-glyph circle:nth-of-type(3) { animation-delay: 1.6s; }
@keyframes web-chat-rhizome-draw { to { stroke-dashoffset: 0; } }
@keyframes web-chat-rhizome-pop { to { opacity: 1; } }
.web-chat-empty-state-eyebrow {
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--color-text-light);
}
.web-chat-empty-state h2 {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 520;
  font-size: clamp(1.75rem, 3vw, 2.5rem);
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--color-text);
}
.web-chat-empty-state h2 em {
  font-style: italic;
  color: var(--color-accent);
  font-weight: 400;
}
.web-chat-empty-state p { margin: 0; max-width: 40ch; line-height: 1.7; }

/* ─── Messages ─── */
.web-chat-message {
  position: relative;
  max-width: min(48rem, 100%);
  min-width: 0;
  display: grid;
  gap: 0.5rem;
}
.web-chat-message::before {
  content: "";
  position: absolute;
  left: calc(-1.5rem - 5px);
  top: 0.55rem;
  width: 11px; height: 11px;
  border-radius: 50%;
  background: var(--color-bg);
  box-shadow:
    inset 0 0 0 2px var(--color-secondary),
    0 0 0 4px var(--color-bg);
}
.web-chat-message::after {
  content: "";
  position: absolute;
  left: calc(-1.5rem + 6px);
  top: 0.95rem;
  width: calc(1.5rem - 6px);
  height: 1px;
  background: linear-gradient(90deg, rgb(from var(--color-secondary) r g b / 0.5), transparent);
}
.web-chat-message-header {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-text-light);
}
.web-chat-message-header time {
  color: var(--color-text-light);
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
  background: rgb(255 255 255 / 0.06);
  font-family: var(--font-label);
  font-size: 0.9em;
}
.web-chat-message-bubble a {
  color: var(--color-accent);
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: rgb(from var(--color-accent) r g b / 0.5);
}
.web-chat-message-bubble ul,
.web-chat-message-bubble ol { margin: 0 0 0.75rem; padding-left: 1.25rem; }
.web-chat-message-bubble li { margin-bottom: 0.35rem; }

/* user — amber notched panel */
.web-chat-message[data-role="user"] .web-chat-message-header { color: var(--color-accent); }
.web-chat-message[data-role="user"]::before {
  box-shadow:
    inset 0 0 0 2px var(--color-accent),
    0 0 0 4px var(--color-bg),
    0 0 14px rgb(from var(--color-accent) r g b / 0.5);
}
.web-chat-message[data-role="user"]::after {
  background: linear-gradient(90deg, rgb(from var(--color-accent) r g b / 0.55), transparent);
}
.web-chat-message[data-role="user"] .web-chat-message-bubble {
  padding: 0.9rem 1.1rem;
  background: linear-gradient(135deg,
    rgb(from var(--color-accent) r g b / 0.14) 0%,
    rgb(from var(--color-accent) r g b / 0.04) 100%);
  border: 1px solid rgb(from var(--color-accent) r g b / 0.25);
  color: var(--color-text);
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%);
}

/* assistant — editorial body, Fraunces drop-cap on first paragraph */
.web-chat-message[data-role="assistant"] .web-chat-message-header { color: var(--color-secondary); }
.web-chat-message[data-role="assistant"]::before {
  box-shadow:
    inset 0 0 0 2px var(--color-secondary),
    0 0 0 4px var(--color-bg),
    0 0 14px rgb(from var(--color-secondary) r g b / 0.55);
}
.web-chat-message[data-role="assistant"] .web-chat-message-bubble {
  padding: 0.1rem 0 0;
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.8;
}
.web-chat-message[data-role="assistant"] .web-chat-message-bubble > .web-chat-markdown-response:first-child > p:first-of-type::first-letter,
.web-chat-message[data-role="assistant"] .web-chat-message-bubble > p:first-of-type::first-letter {
  font-family: var(--font-display);
  font-weight: 520;
  font-size: 2.4em;
  float: left;
  line-height: 0.85;
  padding: 0.18em 0.18em 0 0;
  color: var(--color-accent);
}

/* ─── Code block ─── */
.web-chat-code-block {
  margin: 0.85rem 0 0;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  background: rgb(0 0 0 / 0.35);
}
.web-chat-code-block figcaption {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.5rem 0.85rem;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-family: var(--font-label);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.web-chat-code-block pre {
  margin: 0;
  padding: 0.9rem 1rem;
  overflow: auto;
  font-family: var(--font-label);
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text);
}

/* ─── Data parts (instrument cards) ─── */
.web-chat-data-part,
.web-chat-confirmation {
  position: relative;
  margin: 1rem 0 0;
  border: 1px solid var(--color-border);
  background: linear-gradient(135deg,
    rgb(from var(--palette-purple) r g b / 0.06) 0%,
    rgb(from var(--palette-purple) r g b / 0.01) 100%);
  overflow: hidden;
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%);
}
.web-chat-data-part::before,
.web-chat-confirmation::before {
  content: "";
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 2px;
  background: linear-gradient(180deg,
    rgb(from var(--color-secondary) r g b / 0.9),
    rgb(from var(--color-secondary) r g b / 0.2));
}
.web-chat-data-part-header,
.web-chat-confirmation-header {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.55rem 0.95rem;
  border-bottom: 1px solid var(--color-border);
  font-family: var(--font-label);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--color-secondary);
}
.web-chat-data-part-header::before,
.web-chat-confirmation-header::before {
  content: "[";
  color: var(--color-text-light);
  font-weight: 400;
  letter-spacing: 0;
}
.web-chat-data-part-header::after,
.web-chat-confirmation-header::after {
  content: "]";
  color: var(--color-text-light);
  font-weight: 400;
  letter-spacing: 0;
  margin-left: auto;
}
.web-chat-data-part-body { padding: 0.85rem 1rem; }
.web-chat-data-part-body pre {
  margin: 0;
  font-family: var(--font-label);
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--color-text);
  overflow: auto;
}
.web-chat-data-part summary {
  cursor: pointer;
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--color-text-muted);
}

.web-chat-confirmation[data-state="resolved"] {
  background: linear-gradient(135deg,
    rgb(from var(--color-success) r g b / 0.07) 0%,
    rgb(from var(--color-success) r g b / 0.01) 100%);
}
.web-chat-confirmation[data-state="resolved"]::before {
  background: linear-gradient(180deg,
    rgb(from var(--color-success) r g b / 0.9),
    rgb(from var(--color-success) r g b / 0.2));
}
.web-chat-confirmation[data-state="resolved"] .web-chat-confirmation-header { color: var(--color-success); }

.web-chat-data-part[data-kind="tool-result"] {
  background: linear-gradient(135deg,
    rgb(from var(--color-accent) r g b / 0.07) 0%,
    rgb(from var(--color-accent) r g b / 0.01) 100%);
}
.web-chat-data-part[data-kind="tool-result"]::before {
  background: linear-gradient(180deg,
    rgb(from var(--color-accent) r g b / 0.9),
    rgb(from var(--color-accent) r g b / 0.2));
}
.web-chat-data-part[data-kind="tool-result"] .web-chat-data-part-header { color: var(--color-accent); }

.web-chat-confirmation-body { padding: 0.85rem; display: grid; gap: 0.85rem; }
.web-chat-confirmation-summary { margin: 0; color: var(--color-text); line-height: 1.6; }
.web-chat-confirmation-details {
  padding: 0.75rem 0.85rem;
  border-radius: 10px;
  background: rgb(0 0 0 / 0.25);
  color: var(--color-text-muted);
  font-family: var(--font-label);
  font-size: 12.5px;
}
.web-chat-confirmation-details strong { color: var(--color-text); font-weight: 600; }
.web-chat-confirmation-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.web-chat-confirmation-actions button {
  flex: 1 1 auto;
  min-height: 40px;
  padding: 0 1.1rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.04);
  color: var(--color-text);
  font-family: var(--font-label);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
}
.web-chat-confirmation-actions button:hover { transform: translateY(-1px); border-color: rgb(255 255 255 / 0.4); }
.web-chat-confirmation-actions button[data-variant="primary"] {
  background: var(--color-accent);
  color: var(--color-on-accent);
  border-color: transparent;
  box-shadow: 0 8px 32px -8px var(--color-glow-cta);
}
.web-chat-confirmation-actions button[data-variant="primary"]:hover {
  background: var(--color-accent-dark);
  box-shadow: 0 12px 36px -8px var(--color-glow-cta-strong);
}
.web-chat-confirmation-actions button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
.web-chat-confirmation-result {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  background: rgb(from var(--color-success) r g b / 0.12);
  color: var(--color-success);
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

/* ─── Status (growing root + italic phrase) ─── */
.web-chat-status {
  display: inline-flex;
  align-items: center;
  gap: 0.85rem;
  margin: 0;
  color: var(--color-text-muted);
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
    rgb(from var(--color-accent) r g b / 0.45),
    rgb(from var(--color-secondary) r g b / 0.45));
}
.web-chat-status-rail::after {
  content: "";
  position: absolute;
  left: 100%; top: 50%;
  width: 6px; height: 6px;
  transform: translate(-3px, -50%);
  border-radius: 50%;
  background: var(--color-accent);
  box-shadow: 0 0 10px rgb(from var(--color-accent) r g b / 0.7);
  animation: web-chat-rhizome-grow 1.6s ease-in-out infinite;
}
@keyframes web-chat-rhizome-grow {
  0%   { left: 10%; opacity: 0.4; }
  50%  { left: 100%; opacity: 1; }
  100% { left: 10%; opacity: 0.4; }
}
.web-chat-status-phrase {
  font-family: var(--font-display);
  font-style: italic;
  font-weight: 400;
  font-size: 15px;
  letter-spacing: -0.01em;
  color: var(--color-text-muted);
}
.web-chat-status-meta {
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-text-light);
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
  border: 1px solid rgb(from var(--color-error) r g b / 0.35);
  background: linear-gradient(135deg,
    rgb(from var(--color-error) r g b / 0.1) 0%,
    rgb(from var(--color-error) r g b / 0.02) 100%);
  color: var(--color-text);
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%);
}
.web-chat-error::before {
  content: "";
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 2px;
  background: linear-gradient(180deg,
    rgb(from var(--color-error) r g b / 0.9),
    rgb(from var(--color-error) r g b / 0.2));
}
.web-chat-error-tag {
  font-family: var(--font-label);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--color-error);
}
.web-chat-error p { margin: 0; font-family: var(--font-body); font-size: 14px; color: var(--color-text); }
.web-chat-error button {
  padding: 0.4rem 0.85rem;
  border: 1px solid rgb(from var(--color-error) r g b / 0.5);
  border-radius: 999px;
  background: transparent;
  color: var(--color-error);
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
}
.web-chat-error button:hover { background: rgb(from var(--color-error) r g b / 0.18); }

/* ─── Prompt input (instrument card) ─── */
.web-chat-prompt-input {
  position: relative;
  display: grid;
  gap: 0.5rem;
  padding: 0.95rem 1rem 0.75rem;
  border: 1px solid var(--color-border);
  background: rgb(255 255 255 / 0.03);
  transition: border-color 0.25s ease, background 0.25s ease, box-shadow 0.25s ease;
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%);
}
.web-chat-prompt-input::before {
  content: "";
  position: absolute;
  left: 0; top: 0; bottom: 16px;
  width: 2px;
  background: linear-gradient(180deg, rgb(from var(--color-accent) r g b / 0.4), transparent);
}
.web-chat-prompt-input:focus-within {
  border-color: rgb(from var(--color-accent) r g b / 0.5);
  background: rgb(from var(--color-accent) r g b / 0.05);
  box-shadow: 0 0 0 4px rgb(from var(--color-accent) r g b / 0.08);
}
.web-chat-prompt-input label {
  font-family: var(--font-label);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-text-light);
}
.web-chat-prompt-textarea {
  width: 100%;
  min-height: 3.25rem;
  max-height: 14rem;
  padding: 0.4rem 0;
  border: 0;
  background: transparent;
  color: var(--color-text);
  resize: none;
  outline: none;
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 1.55;
}
.web-chat-prompt-textarea::placeholder { color: var(--color-text-light); }
.web-chat-prompt-footer {
  display: flex; align-items: center; justify-content: space-between;
  gap: 0.75rem;
}
.web-chat-prompt-hint {
  font-family: var(--font-label);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-text-light);
}
.web-chat-prompt-hint kbd {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgb(255 255 255 / 0.08);
  border: 1px solid var(--color-border);
  font-family: var(--font-label);
  font-size: 10px;
  color: var(--color-text);
}
.web-chat-prompt-submit {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 40px;
  padding: 0 1.1rem;
  border: 0;
  border-radius: 999px;
  background: var(--color-accent);
  color: var(--color-on-accent);
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
  box-shadow: 0 8px 24px -8px var(--color-glow-cta);
}
.web-chat-prompt-submit:hover {
  transform: translateY(-1px);
  background: var(--color-accent-dark);
  box-shadow: 0 14px 36px -10px var(--color-glow-cta-strong);
}
.web-chat-prompt-submit:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
.web-chat-prompt-submit svg {
  width: 14px; height: 14px;
  transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.web-chat-prompt-submit:hover svg { transform: translateX(2px); }

@media (max-width: 760px) {
  .web-chat-shell { grid-template-columns: 1fr; height: auto; min-height: 100vh; }
  .web-chat-shell .web-chat-app { border-left: 0; border-top: 1px solid var(--color-border-light); }
  .web-chat-sessions { padding-bottom: 0.5rem; }
  .web-chat-sessions-list { max-height: 200px; }
  .web-chat-app { padding: 1rem; }
  .web-chat-message { max-width: 100%; }
}
`;

interface ActiveStream {
  writer: UIMessageStreamWriter<UIMessage>;
}

export class WebChatInterface extends MessageInterfacePlugin<WebChatConfig> {
  declare protected config: WebChatConfig;
  private readonly activeStreams = new Map<string, ActiveStream>();

  constructor(config: Partial<WebChatConfig> = {}) {
    super("web-chat", packageJson, config, webChatConfigSchema);
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
        path: "/api/chat/confirm",
        method: "POST",
        public: true,
        handler: (request): Promise<Response> =>
          this.handleConfirmationRequest(request),
      },
      {
        path: "/api/chat/sessions",
        method: "GET",
        public: true,
        handler: (request): Promise<Response> =>
          this.handleSessionsRequest(request),
      },
      {
        path: "/api/chat/messages",
        method: "GET",
        public: true,
        handler: (request): Promise<Response> =>
          this.handleMessagesRequest(request),
      },
      {
        path: uiAssetPath,
        method: "GET",
        public: true,
        handler: (): Promise<Response> => this.handleUiAssetRequest(),
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

  private async handleChatPage(request: Request): Promise<Response> {
    const authenticated = await this.isAuthorized(request);
    if (!authenticated) return new Response("Unauthorized", { status: 401 });

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

  private async handleChatRequest(request: Request): Promise<Response> {
    const authenticated = await this.isAuthorized(request);
    if (!authenticated) return new Response("Unauthorized", { status: 401 });

    const body = await request.json();
    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response("Invalid chat request", { status: 400 });
    }

    const message = this.extractLastUserText(parsed.data);
    if (!message) {
      return new Response("No user message found", { status: 400 });
    }

    const conversationId = parsed.data.id ?? this.createId("web");
    const stream = createUIMessageStream<UIMessage>({
      execute: async ({ writer }) => {
        await this.handleStreamedChat({ writer, conversationId, message });
      },
    });

    return createUIMessageStreamResponse({ stream });
  }

  private async handleConfirmationRequest(request: Request): Promise<Response> {
    const authenticated = await this.isAuthorized(request);
    if (!authenticated) return new Response("Unauthorized", { status: 401 });

    const parsed = confirmationRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return new Response("Invalid confirmation request", { status: 400 });
    }

    const response = await this.getContext().agent.confirmPendingAction(
      parsed.data.id,
      parsed.data.confirmed,
    );

    return Response.json({
      text: response.text,
      toolResults: response.toolResults ?? [],
      pendingConfirmation: response.pendingConfirmation ?? null,
    });
  }

  private async handleSessionsRequest(request: Request): Promise<Response> {
    const authenticated = await this.isAuthorized(request);
    if (!authenticated) return new Response("Unauthorized", { status: 401 });

    const conversations = await this.getContext().conversations.list({
      interfaceType: webChatInterfaceType,
      limit: webChatSessionLimit,
    });
    const sessions = await Promise.all(
      conversations.map(async (conversation) => ({
        id: conversation.id,
        title: await this.getConversationTitle(conversation.id),
        lastActiveAt: conversation.lastActiveAt,
      })),
    );

    return Response.json({ sessions });
  }

  private async getConversationTitle(conversationId: string): Promise<string> {
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

  private async handleMessagesRequest(request: Request): Promise<Response> {
    const authenticated = await this.isAuthorized(request);
    if (!authenticated) return new Response("Unauthorized", { status: 401 });

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
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
      })),
    });
  }

  private async handleStreamedChat(input: {
    writer: UIMessageStreamWriter<UIMessage>;
    conversationId: string;
    message: string;
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
          userPermissionLevel: "anchor",
          interfaceType: webChatInterfaceType,
          channelId: input.conversationId,
          channelName: "Web Chat",
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
      if (response.pendingConfirmation) {
        input.writer.write({
          type: "data-confirmation",
          id: this.createId("confirmation"),
          data: response.pendingConfirmation,
        });
      }
    } finally {
      this.endProcessingInput();
      this.activeStreams.delete(input.conversationId);
    }
  }

  private getActiveStream(channelId: string | null): ActiveStream | undefined {
    if (!channelId) return undefined;
    return this.activeStreams.get(channelId);
  }

  private async isAuthorized(request: Request): Promise<boolean> {
    const authService = getActiveAuthService();
    if (!authService) return true;
    const session = await authService.getOperatorSession(request);
    return session !== undefined;
  }

  private extractLastUserText(request: ChatRequest): string {
    const lastUserMessage = this.findLastUserMessage(request);
    if (!lastUserMessage) return "";
    if (lastUserMessage.content) return lastUserMessage.content;

    return (lastUserMessage.parts ?? [])
      .map((part) => {
        const parsed = textPartSchema.safeParse(part);
        return parsed.success ? parsed.data.text : "";
      })
      .filter((part) => part.length > 0)
      .join("\n");
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
    return `<!doctype html><html lang="en" data-theme-profile="product"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Brain Chat</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..700&family=Barlow:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"><style data-web-chat-styles>${chatPageStyles}</style></head><body><main id="root" data-web-chat-root>Brain Chat</main><script type="module" src="${uiAssetPath}"></script></body></html>`;
  }

  private createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
