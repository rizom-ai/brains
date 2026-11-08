import type { CapabilityBundleDefinition } from "@brains/app";
import type {
  BrainAnchorConfigKind,
  BrainIdentity,
  DeploymentConfigInput,
  PermissionConfig,
  ReasoningEffort,
} from "@brains/sdk";

/** One of the canonical brain's capability bundles: plain, validated data. */
export type CanonicalBundleDefinition = CapabilityBundleDefinition;

/**
 * The canonical brain as its consumers read it: what it is and which
 * bundles it offers. Its plugin catalog and site package are runtime
 * machinery, read by the brain itself and left out of the public type, so
 * the published declarations need neither the runtime's database nor its
 * MCP server. The runtime's definition is assigned to this type where the
 * model entry exports it, so the two cannot drift apart.
 */
export interface CanonicalBrainDefinition {
  readonly name: string;
  readonly version: string;
  readonly bundleContract?: string | undefined;
  readonly anchor?: BrainAnchorConfigKind | undefined;
  readonly kind?: string | undefined;
  readonly model?: string | undefined;
  readonly reasoningEffort?: ReasoningEffort | undefined;
  readonly identity?: BrainIdentity | undefined;
  readonly agentInstructions?: readonly string[] | undefined;
  readonly bundles?: readonly CanonicalBundleDefinition[] | undefined;
  readonly permissions?: PermissionConfig | undefined;
  readonly deployment?: DeploymentConfigInput | undefined;
  readonly evalDisable?: readonly string[] | undefined;
}
