import {
  automationBundle as automation,
  canonicalBrain as canonical,
  chatBundle as chat,
  coreBundle as core,
  federationBundle as federation,
  mediaBundle as media,
  publishingBundle as publishing,
  siteBundle as site,
  teamBundle as team,
  webBundle as web,
} from "../model/canonical-brain";
import type {
  CanonicalBrainDefinition,
  CanonicalBundleDefinition,
} from "../model/public-definition";

export type {
  CanonicalBrainDefinition,
  CanonicalBundleDefinition,
} from "../model/public-definition";

// Typed as their public views: the runtime's definition is assignable to
// them, and its plugin catalog stays out of the published declarations.
export const canonicalBrain: CanonicalBrainDefinition = canonical;
export const coreBundle: CanonicalBundleDefinition = core;
export const mediaBundle: CanonicalBundleDefinition = media;
export const automationBundle: CanonicalBundleDefinition = automation;
export const webBundle: CanonicalBundleDefinition = web;
export const chatBundle: CanonicalBundleDefinition = chat;
export const siteBundle: CanonicalBundleDefinition = site;
export const publishingBundle: CanonicalBundleDefinition = publishing;
export const federationBundle: CanonicalBundleDefinition = federation;
export const teamBundle: CanonicalBundleDefinition = team;
export default canonicalBrain;

export {
  CORE_BUNDLE_ID,
  MEDIA_BUNDLE_ID,
  AUTOMATION_BUNDLE_ID,
  WEB_BUNDLE_ID,
  CHAT_BUNDLE_ID,
  SITE_BUNDLE_ID,
  PUBLISHING_BUNDLE_ID,
  FEDERATION_BUNDLE_ID,
  TEAM_BUNDLE_ID,
  CANONICAL_BUNDLE_CONTRACT,
} from "../model/canonical-brain";
export {
  BRAIN_RECIPE_NAMES,
  expandBrainRecipe,
  type BrainRecipeName,
  type BrainRecipeExpansion,
} from "../lib/brain-recipes";
