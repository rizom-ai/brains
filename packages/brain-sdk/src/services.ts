/** Declarative service authoring contract. */

export {
  contentGenerationResultSchema,
  defineAccountSettings,
  defineStudioWorkspace,
  defineDashboardWidget,
  defineEntityCatalog,
  defineJob,
  defineServicePlugin,
  defineSharedState,
  defineTool,
  defineWorkspaceAction,
} from "@brains/plugins";
export type {
  AccountSettingsDefinition,
  AccountSettingsFieldDefinition,
  AccountSettingsSecret,
  AccountSettingsValue,
  StudioWorkspaceDefinition,
  StudioWorkspaceView,
  StudioWorkspaceViewBlock,
  DashboardDigest,
  DashboardOperatorView,
  DashboardOperatorViewBlock,
  DashboardWidgetDefinition,
  OperatorCaller,
  OperatorCapabilityDefinition,
  OperatorCardBlock,
  OperatorColumnsBlock,
  OperatorEntityCatalogDefinition,
  OperatorQueryReader,
  OperatorRegionBlock,
  OperatorView,
  OperatorViewBlock,
  OperatorViewStatus,
  ServiceContentGeneration,
  ServiceContentGenerationContext,
  ServiceContentGenerationItem,
  ServiceContentGenerationResult,
  ServiceContentGenerationSkipReason,
  ServiceContentGenerationTarget,
  ServiceContentGenerationTargetInput,
  ServiceEntityIdPath,
  ServiceJobDefinition,
  ServiceJobReference,
  ServiceJobStatus,
  ServicePackageDefinition,
  ServiceTemplateGenerationDefinition,
  SharedState,
  WorkspaceActionConfirmation,
  WorkspaceActionDefinition,
  WorkspaceActionFormControl,
  WorkspaceActionFormDefinition,
  WorkspaceActionFormFieldDefinition,
  WorkspaceActionFormFieldMap,
  WorkspaceActionFormOption,
  WorkspaceActionResultDefinition,
  WorkspaceActionResultFieldDefinition,
  WorkspaceActionResultFieldMap,
  WorkspacePreparedConfirmation,
} from "@brains/plugins";
export { z } from "@brains/utils/zod";
// A coded failure. Codes survive every supported boundary; the message beside
// one may be reworded, so check the code, not the wording or the class.
export {
  SdkError,
  sdkErrorCodeSchema,
  sdkErrorSchema,
} from "@brains/contracts";
export type { SdkErrorCode, SdkErrorData } from "@brains/contracts";
// What a slot's `entities` reads and writes with, for a handler or helper
// written outside the slot that is handed it.
export type { EntityReader, OwnedEntityWriter } from "@brains/plugins";
// A question one package answers, or a command every package hears, declared
// once and shared by the package that answers it and the ones that ask.
export { defineBusContract } from "@brains/plugins";
// An event every package that listens hears, declared once with the schema
// its payload passes; `messaging.publish(channel, payload)` sends it.
export { defineChannel } from "@brains/plugins";
// The HTTP routes a service serves, declared as an interface declares them.
export { defineRoute, protocol } from "@brains/plugins";
export type { BusContract, BusResult, Channel } from "@brains/contracts";
