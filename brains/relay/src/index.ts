import { defineBrain, type PluginConfig } from "@brains/app";
// System tools are now framework-level (registered by shell, not a plugin)
import { MCPInterface } from "@brains/mcp";
import { DiscordInterface } from "@brains/discord";
import { A2AInterface } from "@brains/a2a";
import { WebserverInterface } from "@brains/webserver";
import { directorySync } from "@brains/directory-sync";

import { join } from "path";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { siteContentPlugin } from "@brains/site-content";
import { siteInfoPlugin } from "@brains/site-info";
import { topicsPlugin } from "@brains/topics";
import { linkPlugin } from "@brains/link";
import { notePlugin } from "@brains/note";
import { imagePlugin } from "@brains/image-plugin";
import { summaryPlugin } from "@brains/summary";
import { decksPlugin } from "@brains/decks";
import { promptPlugin } from "@brains/prompt";
import { agentDiscovery } from "@brains/agent-discovery";
import defaultSite from "@brains/site-default";
import rizomTheme from "@brains/theme-rizom";

/**
 * Relay Brain Model
 *
 * A collaborative knowledge management brain for teams.
 *
 * Centre of gravity: capture → synthesize → share _within a team_, with
 * an optional public face. Anything that helps multiple humans co-author
 * understanding belongs here; personal branding and product marketing
 * live in rover and ranger instead.
 *
 * Identity is defined in seed-content/ (brain-character, site-info,
 * anchor-profile) — editable at runtime, single source of truth.
 *
 * Instance-specific config (homeserver, userId, repo, domain) goes
 * in brain.yaml. Only secrets (tokens, API keys) come from .env.
 *
 * See docs/plans/relay-presets.md for the preset philosophy and the
 * plugins deferred for future work.
 */

// Core preset — a team brain with no public website.
//
// Think: a Discord-backed team assistant that captures notes and links,
// auto-extracts topic clusters, and can talk to peer brains via A2A.
// No site-builder, no webserver — purely chat + MCP + brain-data.
const core = [
  "prompt",
  "directory-sync",
  "note",
  "link",
  "topics",
  "agents",
  "mcp",
  "discord",
  "a2a",
];

// Default preset — core plus a public website.
//
// Adds the minimal site-building surface (site-info, site-builder,
// webserver, site-content) and image handling. The capture entities
// from core (note, link) will auto-register their routes on the site.
// Used by instances like rizom-foundation.
const defaultPreset = [
  ...core,
  "image",
  "site-info",
  "site-content",
  "site-builder",
  "webserver",
];

export default defineBrain({
  name: "relay",
  version: "0.1.0",
  model: "gpt-5.4-mini",
  site: defaultSite,
  theme: rizomTheme,
  presets: {
    core,
    default: defaultPreset,
  },

  evalDisable: ["webserver", "discord"],

  capabilities: [
    ["prompt", promptPlugin, undefined],
    ["note", notePlugin, {}],
    ["link", linkPlugin, {}],
    ["image", imagePlugin, undefined],
    ["topics", topicsPlugin, {}],
    // summary needs work before it can join a preset — keep registered
    // so instances can opt in via `add: [summary]` once it's ready.
    ["summary", summaryPlugin, {}],
    // decks is not in core or default yet — kept registered so
    // presentation-heavy relay instances can opt in via `add: [decks]`.
    ["decks", decksPlugin, undefined],
    ["agents", agentDiscovery, undefined],
    [
      "directory-sync",
      directorySync,
      {
        seedContent: true,
        seedContentPath: join(import.meta.dir, "..", "seed-content"),
        initialSync: true,
      },
    ],
    ["site-content", siteContentPlugin, undefined],
    ["site-info", siteInfoPlugin, undefined],
    ["site-builder", siteBuilderPlugin, {}],
  ],

  interfaces: [
    ["mcp", MCPInterface, (): PluginConfig => ({})],
    ["discord", DiscordInterface, (): PluginConfig => ({ captureUrls: true })],
    ["a2a", A2AInterface, (): PluginConfig => ({})],
    ["webserver", WebserverInterface, (): PluginConfig => ({})],
  ],

  permissions: {
    rules: [
      { pattern: "cli:*", level: "anchor" },
      { pattern: "mcp:stdio", level: "anchor" },
      { pattern: "mcp:http", level: "anchor" },
      { pattern: "discord:*", level: "public" },
    ],
  },

  deployment: {
    cdn: {
      enabled: true,
      provider: "bunny",
    },
  },
});
