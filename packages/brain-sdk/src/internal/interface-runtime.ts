/**
 * Internal, first-party only: what a first-party interface converted from a
 * class needs and the public interface contract does not offer, reached with
 * `interfaceRuntime(context)` on a setup or slot context the brain built,
 * and the first-party declarations beside a public definition: a daemon as
 * its class registered it (`withDaemon`), a message transport the
 * runtime's message coordination sends through (`withMessageTransport`) and
 * the channels its class registered in every process (`withChannels`),
 * the HTTP routes it served as written (`withWebRoutes`), the tools it
 * registered under their names (`withTools`) and the protocol-only
 * registration it built of itself (`withProtocolPlugin`).
 * Each takes plain data and functions. No public entry exports this module.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-interface-runtime).
 */

export {
  interfaceRuntime,
  withChannels,
  withDaemon,
  withMessageTransport,
  withProtocolPlugin,
  withTools,
  withWebRoutes,
  type FirstPartyChannel,
  type FirstPartyChannelsContext,
  type FirstPartyDaemon,
  type FirstPartySlotContext,
  type InterfaceMessages,
  type InterfaceRuntime,
  type MessageTransport,
  type MessageTransportEdit,
  type MessageTransportSend,
} from "@brains/plugins";
