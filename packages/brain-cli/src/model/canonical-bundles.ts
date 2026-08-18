import { defineBundle, type CapabilityBundleDefinition } from "@brains/app";
import {
  publishingAgentInstructions,
  publishingBundleConfig,
  teamAgentInstructions,
  teamBundleConfig,
  trustedContentEntityActions,
} from "./bundle-policy";

export const CORE_BUNDLE_ID = "core";
export const MEDIA_BUNDLE_ID = "media";
export const AUTOMATION_BUNDLE_ID = "automation";
export const WEB_BUNDLE_ID = "web";
export const CHAT_BUNDLE_ID = "chat";
export const SITE_BUNDLE_ID = "site";
export const PUBLISHING_BUNDLE_ID = "publishing";
export const FEDERATION_BUNDLE_ID = "federation";
export const TEAM_BUNDLE_ID = "team";

export const coreBundle: CapabilityBundleDefinition = defineBundle({
  id: CORE_BUNDLE_ID,
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

export const mediaBundle: CapabilityBundleDefinition = defineBundle({
  id: MEDIA_BUNDLE_ID,
  members: ["document", "image"],
});

export const automationBundle: CapabilityBundleDefinition = defineBundle({
  id: AUTOMATION_BUNDLE_ID,
  members: ["playbook", "playbooks", "onboarding"],
});

export const webBundle: CapabilityBundleDefinition = defineBundle({
  id: WEB_BUNDLE_ID,
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

export const chatBundle: CapabilityBundleDefinition = defineBundle({
  id: CHAT_BUNDLE_ID,
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

export const siteBundle: CapabilityBundleDefinition = defineBundle({
  id: SITE_BUNDLE_ID,
  members: ["site-info", "site-content", "site-builder", "analytics"],
  config: [
    {
      member: "dashboard",
      value: { routePath: "/dashboard" },
      overrides: WEB_BUNDLE_ID,
    },
  ],
  evalDisable: ["analytics"],
});

export const publishingBundle: CapabilityBundleDefinition = defineBundle({
  id: PUBLISHING_BUNDLE_ID,
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

export const federationBundle: CapabilityBundleDefinition = defineBundle({
  id: FEDERATION_BUNDLE_ID,
  members: ["atproto", "atproto-registry"],
  evalDisable: ["atproto"],
});

export const teamBundle: CapabilityBundleDefinition = defineBundle({
  id: TEAM_BUNDLE_ID,
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
      overrides: WEB_BUNDLE_ID,
    },
  ],
  agentInstructions: teamAgentInstructions,
});

export const canonicalBundles: CapabilityBundleDefinition[] = [
  coreBundle,
  mediaBundle,
  automationBundle,
  webBundle,
  chatBundle,
  siteBundle,
  publishingBundle,
  federationBundle,
  teamBundle,
];
