import { defineBundle, type CapabilityBundleDefinition } from "@brains/app";
import {
  publishingAgentInstructions,
  publishingBundleConfig,
  teamAgentInstructions,
  teamBundleConfig,
  trustedContentEntityActions,
} from "./bundle-policy";

/**
 * The target taxonomy is intentionally not registered on canonicalBrain yet.
 * Tests resolve a cloned definition against this complete set; Phase 8 swaps
 * it into the active definition together with every checked-in selection.
 */
export const targetCoreBundle: CapabilityBundleDefinition = defineBundle({
  id: "core",
  members: [
    "profile",
    "prompt",
    "style-guide",
    "directory-sync",
    "note",
    "link",
    "topics",
    "unified-inbox",
    "mcp",
    "a2a",
    "agents",
  ],
  evalDisable: ["mcp"],
});

export const targetMediaBundle: CapabilityBundleDefinition = defineBundle({
  id: "media",
  members: ["document", "image"],
});

export const targetAutomationBundle: CapabilityBundleDefinition = defineBundle({
  id: "automation",
  members: ["playbook", "playbooks", "onboarding"],
});

export const targetWebBundle: CapabilityBundleDefinition = defineBundle({
  id: "web",
  members: [
    "webserver",
    "auth-service",
    "account",
    "admin",
    "dashboard",
    "cms",
  ],
  config: [{ member: "dashboard", value: { routePath: "/" } }],
  permissions: [
    {
      member: "mcp",
      config: { rules: [{ pattern: "mcp:http", level: "public" }] },
    },
  ],
  evalDisable: ["webserver", "dashboard"],
});

export const targetChatBundle: CapabilityBundleDefinition = defineBundle({
  id: "chat",
  members: [
    "chat",
    "web-chat",
    "email",
    "notifications",
    "conversation-memory",
  ],
  permissions: [
    {
      member: "chat",
      config: { rules: [{ pattern: "discord:*", level: "public" }] },
    },
    {
      member: "web-chat",
      config: { rules: [{ pattern: "web-chat:*", level: "admin" }] },
    },
  ],
  evalDisable: ["chat", "web-chat", "email"],
});

export const targetSiteBundle: CapabilityBundleDefinition = defineBundle({
  id: "site",
  members: ["site-info", "site-content", "site-builder", "analytics"],
  config: [
    {
      member: "dashboard",
      value: { routePath: "/dashboard" },
      overrides: "web",
    },
  ],
  evalDisable: ["analytics"],
});

export const targetPublishingBundle: CapabilityBundleDefinition = defineBundle({
  id: "publishing",
  members: [
    "blog",
    "series",
    "portfolio",
    "decks",
    "content-pipeline",
    "social-media",
    "newsletter",
    "stock-photo",
  ],
  config: publishingBundleConfig,
  agentInstructions: publishingAgentInstructions,
});

export const targetFederationBundle: CapabilityBundleDefinition = defineBundle({
  id: "federation",
  members: ["atproto", "atproto-registry"],
  evalDisable: ["atproto"],
});

export const targetTeamBundle: CapabilityBundleDefinition = defineBundle({
  id: "team",
  members: [],
  config: teamBundleConfig,
  permissions: [
    {
      member: "note",
      config: { entityActions: { note: trustedContentEntityActions } },
    },
    {
      member: "link",
      config: { entityActions: { link: trustedContentEntityActions } },
    },
    {
      member: "image",
      config: { entityActions: { image: trustedContentEntityActions } },
    },
    {
      member: "docs",
      config: { entityActions: { doc: trustedContentEntityActions } },
    },
    {
      member: "conversation-memory",
      config: {
        entityActions: {
          decision: trustedContentEntityActions,
          "action-item": trustedContentEntityActions,
        },
      },
    },
    {
      member: "mcp",
      config: { rules: [{ pattern: "mcp:http", level: "admin" }] },
      overrides: "web",
    },
  ],
  agentInstructions: teamAgentInstructions,
});

export const targetCanonicalBundles: CapabilityBundleDefinition[] = [
  targetCoreBundle,
  targetMediaBundle,
  targetAutomationBundle,
  targetWebBundle,
  targetChatBundle,
  targetSiteBundle,
  targetPublishingBundle,
  targetFederationBundle,
  targetTeamBundle,
];
