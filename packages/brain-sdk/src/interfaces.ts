/** Declarative public interface authoring contract. */

export {
  defineAccountSettings,
  defineDaemon,
  defineInterface,
  defineMessageInterface,
  defineMessageInterfacePackage,
  defineRoute,
  protocol,
} from "@brains/plugins";
export type {
  AccountSettingsDefinition,
  AccountSettingsFieldDefinition,
  AccountSettingsValue,
} from "@brains/plugins";
// A coded failure a route throws; it is answered in its public form with the
// status its code names.
export { SdkError } from "@brains/contracts";
export { UserPermissionLevelSchema } from "@brains/templates";
export type { UserPermissionLevel } from "@brains/templates";
export { z } from "@brains/utils/zod";
