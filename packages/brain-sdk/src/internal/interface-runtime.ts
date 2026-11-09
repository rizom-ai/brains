/**
 * Internal, first-party only: what a first-party interface converted from a
 * class needs and the public interface contract does not offer, reached with
 * `interfaceRuntime(context)` on a setup or slot context the brain built,
 * and the first-party declarations beside a public definition: a daemon as
 * its class registered it (`withDaemon`) and a message transport the
 * runtime's message coordination sends through (`withMessageTransport`).
 * Each takes plain data and functions. No public entry exports this module.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-interface-runtime).
 */

export {
  interfaceRuntime,
  withDaemon,
  withMessageTransport,
  type FirstPartyDaemon,
  type FirstPartySlotContext,
  type InterfaceMessages,
  type InterfaceRuntime,
  type MessageTransport,
  type MessageTransportSend,
} from "@brains/plugins";
