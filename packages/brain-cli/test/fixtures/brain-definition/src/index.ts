import {
  PLUGIN_API_VERSION,
  defineBrain,
  defineBundle,
  type BrainDefinition,
  type BrainEnvironment,
  type CapabilityBundleDefinition,
  type CapabilityEntry,
  type Plugin,
  type PluginConfig,
} from "@rizom/brain";

const fixturePlugin: Plugin = {
  id: "fixture-service",
  version: "0.1.0",
  type: "service",
  packageName: "@rizom/brain-definition-fixture",
};

const fixtureCapability: CapabilityEntry = [
  "fixture-service",
  (_config: PluginConfig): Plugin => fixturePlugin,
  (env: BrainEnvironment, context): PluginConfig => ({
    greeting: env["FIXTURE_GREETING"],
    activeBundles: context.bundles,
  }),
];

const coreBundle: CapabilityBundleDefinition = defineBundle({
  id: "core",
  members: ["fixture-service"],
});

export const brain: BrainDefinition = defineBrain({
  name: "fixture-brain",
  version: "0.1.0",
  model: "fixture",
  identity: {
    characterName: "Fixture",
    role: "Compile fixture",
    purpose: "Prove root public brain definition types",
    values: ["stability"],
  },
  capabilities: [fixtureCapability],
  interfaces: [],
  bundles: [coreBundle],
});

void PLUGIN_API_VERSION;

export default brain;
