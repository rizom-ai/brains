/**
 * Internal, first-party only: what a first-party service converted from a
 * class needs and the public service contract does not offer, reached with
 * `serviceRuntime(context)` on a slot context the brain built, tools that
 * keep snake-case names, and the system channels such a service hears. No
 * public entry exports this module.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-service-runtime).
 */

export {
  firstPartyTool,
  serviceRuntime,
  type ServiceEntityShapes,
  type ServiceIdentity,
  type ServiceListenHandler,
  type ServiceListenMode,
  type ServiceListenOptions,
  type ServiceRuntime,
} from "@brains/plugins";
export { SYSTEM_CHANNELS, initialSyncCompletedChannel } from "@brains/plugins";
