/** Declarative public interface authoring contract. */

export {
  defineAccountSettings,
  defineDaemon,
  defineInterface,
  defineMessageInterface,
  defineSubscription,
  defineRoute,
  protocol,
} from "@brains/plugins";
export type {
  AccountSettingsDefinition,
  AccountSettingsFieldDefinition,
  AccountSettingsValue,
} from "@brains/plugins";
export { UserPermissionLevelSchema } from "@brains/templates";
export type { UserPermissionLevel } from "@brains/templates";
export { z } from "@brains/utils/zod";

// The durable store `setup` hands an interface, so a declaration can hold one.
// Named consumer: @brains/email, which keeps an IMAP cursor.
export type { IRuntimeStateStore } from "@brains/plugins";
