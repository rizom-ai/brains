import { defineBrain, type PluginConfig } from "@brains/app";
// System tools are now framework-level (registered by shell, not a plugin)
import { MCPInterface } from "@brains/mcp";
import { DiscordInterface } from "@brains/discord";
import { A2AInterface } from "@brains/a2a";
import { WebserverInterface } from "@brains/webserver";
import { authServicePlugin } from "@brains/auth-service";
import { directorySync } from "@brains/directory-sync";

import { join } from "path";
import { cmsPlugin } from "@brains/cms";
import { dashboardPlugin } from "@brains/dashboard";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { siteContentPlugin } from "@brains/site-content";
import { siteInfoPlugin } from "@brains/site-info";
import { topicsPlugin } from "@brains/topics";
import { linkPlugin } from "@brains/link";
import { notePlugin } from "@brains/note";
import { imagePlugin } from "@brains/image-plugin";
import { summaryPlugin } from "@brains/summary";
import { decksPlugin } from "@brains/decks";
import { docsPlugin } from "@brains/doc";
import { promptPlugin } from "@brains/prompt";
import { rizomEcosystemPlugin } from "@brains/rizom-ecosystem";
import { agentDiscovery } from "@brains/agent-discovery";
import { assessment } from "@brains/assessment";
import rizomTheme from "@brains/theme-rizom";
import { relaySite, relaySiteContentDefinition } from "./site";

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
// Uses the shared webserver host for HTTP health/admin entrypoints, but
// does not require site-builder or preview/public-site behavior.
const core = [
  "prompt",
  "directory-sync",
  "note",
  "link",
  "topics",
  "summary",
  "agents",
  "assessment",
  "auth-service",
  "cms",
  "dashboard",
  "mcp",
  "webserver",
  "discord",
  "a2a",
];

// Default preset — core plus a minimal public website.
//
// Adds the minimal site-building surface and image handling. The capture
// entities from core (note, link) will auto-register their routes on the site.
// Used by instances like rizom-foundation.
const defaultPreset = [
  ...core,
  "image",
  "site-info",
  "site-content",
  "site-builder",
];

// Full preset — default plus existing team-knowledge surfaces.
//
// Keep Relay distinct from Rover's publishing stack: docs and decks support
// team knowledge sharing without turning Relay into a blog/social/newsletter
// brain. More Relay-native full features (meeting notes, decision records,
// team digest, RAG Q&A, knowledge graph) should land as dedicated plugins.
const full = [...defaultPreset, "docs", "decks"];

const agentInstructions = [
  `Relay is a collaborative team-memory and synthesis brain. Optimize for capturing shared context, finding what the team already knows, summarizing cross-source evidence, and coordinating with peer brains.`,
  `Relay is not Rover-for-teams: do not default to personal branding, blog publishing, newsletters, social media, portfolio, or marketing workflows unless the installed plugins and user request explicitly support them.`,
  `Relay entity mappings: "memo", "note", "team note", "capture" → entityType: base; "summary", "sync", "team digest" → entityType: summary; "handbook", "doc", "documentation" → entityType: doc; "deck", "walkthrough", "presentation" → entityType: deck; "agent", "peer brain", "contact" → entityType: agent.`,
];

export default defineBrain({
  name: "relay",
  version: "0.1.0",
  model: "gpt-5.4-mini",
  site: relaySite,
  theme: rizomTheme,
  presets: {
    core,
    default: defaultPreset,
    full,
  },

  evalDisable: ["webserver", "mcp", "discord"],

  agentInstructions,

  capabilities: [
    ["prompt", promptPlugin, undefined],
    ["note", notePlugin, {}],
    ["link", linkPlugin, {}],
    ["image", imagePlugin, undefined],
    [
      "topics",
      topicsPlugin,
      {
        includeEntityTypes: [
          "base",
          "link",
          "summary",
          "agent",
          "skill",
          "swot",
          "deck",
          "doc",
          "anchor-profile",
          "brain-character",
        ],
        // Relay link capture stores extracted links as drafts until publication;
        // draft links should still inform the private team topic map.
        extractableStatuses: ["published", "draft"],
      },
    ],
    ["summary", summaryPlugin, {}],
    ["docs", docsPlugin, undefined],
    ["decks", decksPlugin, undefined],
    ["agents", agentDiscovery, undefined],
    ["assessment", assessment, undefined],
    ["auth-service", authServicePlugin, undefined],
    ["cms", cmsPlugin, {}],
    ["dashboard", dashboardPlugin, undefined],
    [
      "directory-sync",
      directorySync,
      {
        seedContent: true,
        seedContentPath: join(import.meta.dir, "..", "seed-content"),
        initialSync: true,
      },
    ],
    [
      "site-content",
      siteContentPlugin,
      { definitions: relaySiteContentDefinition },
    ],
    ["rizom-ecosystem", rizomEcosystemPlugin, undefined],
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
