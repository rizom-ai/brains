import readingEntities from "@fixture/reading-entities";
import readingInsights from "@fixture/reading-insights";
import {
  defineBrain,
  defineBundle,
  use,
  type BrainAnchorConfigKind,
  type BrainDefinition,
  type BrainIdentity,
  type BundleConfigContribution,
  type BundlePermissionContribution,
  type CapabilityBundleDefinition,
  type ConfiguredPluginDefinition,
  type DeploymentConfigInput,
  type PermissionConfig,
  type PluginPackageDefinition,
  type ReasoningEffort,
} from "@rizom/brain";

// Included by the standalone and packed typechecks, not loaded by a brain.

// A package's default export is a package definition, which use() configures.
const insightsPackage: PluginPackageDefinition = readingInsights;
void insightsPackage;
const entities = use(readingEntities);
const insights = use(readingInsights, { summaryPrefix: "Reading" });
const configured: ConfiguredPluginDefinition = insights;
void configured;

// A bundle contributes config and permissions to the members it names.
const summaryConfig: BundleConfigContribution<typeof insights> = {
  member: insights,
  value: { summaryPrefix: "Bundled reading" },
};
const insightsPermissions: BundlePermissionContribution<typeof insights> = {
  member: insights,
  config: { admins: ["reading-insights:operator"] },
};
const reader = defineBundle({
  id: "reader",
  members: [entities, insights],
  config: [summaryConfig],
  permissions: [insightsPermissions],
});
const readerBundle: CapabilityBundleDefinition<
  (typeof reader.members)[number]
> = reader;
void readerBundle;

// Every field a brain definition freezes, each written through its own type.
const identity: BrainIdentity = {
  characterName: "Reader",
  role: "Reading companion",
  purpose: "Keep saved pages useful.",
  values: ["clarity"],
};
const anchor: BrainAnchorConfigKind = "person";
const reasoningEffort: ReasoningEffort = "low";
const deployment: DeploymentConfigInput = {
  domain: "reader.example",
  ports: { production: 8080 },
};
const permissions: PermissionConfig = {
  admins: ["reading-insights:operator"],
};

export const definitionTypeCanary: BrainDefinition<
  (typeof reader.members)[number]
> = defineBrain({
  name: "reader-canary",
  anchor,
  reasoningEffort,
  identity,
  agentInstructions: ["Answer from saved pages."],
  plugins: [entities, insights],
  bundles: [reader],
  permissions,
  deployment,
  evalDisable: [insights],
});

// @ts-expect-error An anchor is a person, a team or an organization.
const unknownAnchor: BrainAnchorConfigKind = "household";
void unknownAnchor;
