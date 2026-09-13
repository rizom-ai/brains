import type * as Public from "../src/public/types";
import type * as Runtime from "../src/index";
import type * as Interfaces from "../src/interfaces";
import type * as EntityContext from "../src/entity/context";
import type { Logger as UtilsLogger } from "@brains/utils/logger";

/**
 * `src/public/types.ts` is the authoring surface published as
 * `@rizom/brain/plugins`, a deliberately narrower restatement of the runtime
 * types. The invariant is one-directional: the runtime must satisfy what the
 * SDK promises; narrowing stays legal.
 *
 * For the five plugin contexts that invariant is enforced structurally — each
 * internal context interface `extends` its published counterpart (see
 * `src/base/context.ts`, `src/service/context.ts`, `src/entity/context.ts`,
 * `src/interface/context.ts`), so a published member the runtime lacks fails
 * to compile at the internal declaration.
 *
 * Every other published declaration is a second, hand-written copy of a
 * runtime type — same name, no `extends`, nothing tying the two together. A
 * promise the runtime stopped keeping would have compiled fine. The
 * assertions below close that gap by naming each pair explicitly; the
 * companion check in `published-surface-coverage.test.ts` fails when a new
 * published declaration arrives without one.
 */

type RuntimeSatisfiesPublic<R extends Published, Published> = R;

type _Plugin = RuntimeSatisfiesPublic<Interfaces.Plugin, Public.Plugin>;

// The five plugin contexts. Already enforced by the `extends` clauses on the
// internal declarations; asserted here too so the pairing is visible in one
// place and the coverage check has nothing to special-case.
type _BasePluginContext = RuntimeSatisfiesPublic<
  Runtime.BasePluginContext,
  Public.BasePluginContext
>;
type _ServicePluginContext = RuntimeSatisfiesPublic<
  Runtime.ServicePluginContext,
  Public.ServicePluginContext
>;
type _EntityPluginContext = RuntimeSatisfiesPublic<
  Runtime.EntityPluginContext,
  Public.EntityPluginContext
>;
type _InterfacePluginContext = RuntimeSatisfiesPublic<
  Runtime.InterfacePluginContext,
  Public.InterfacePluginContext
>;
type _MessageInterfacePluginContext = RuntimeSatisfiesPublic<
  Runtime.MessageInterfacePluginContext,
  Public.MessageInterfacePluginContext
>;

// The context namespaces. Each is declared twice — once here in the published
// surface, once in the runtime module that builds it.
type _IChannelsNamespace = RuntimeSatisfiesPublic<
  Runtime.IChannelsNamespace,
  Public.IChannelsNamespace
>;
type _IConversationsNamespace = RuntimeSatisfiesPublic<
  Runtime.IConversationsNamespace,
  Public.IConversationsNamespace
>;
type _IEvalNamespace = RuntimeSatisfiesPublic<
  Runtime.IEvalNamespace,
  Public.IEvalNamespace
>;
type _IIdentityNamespace = RuntimeSatisfiesPublic<
  Runtime.IIdentityNamespace,
  Public.IIdentityNamespace
>;
type _IInboxNamespace = RuntimeSatisfiesPublic<
  Runtime.IInboxNamespace,
  Public.IInboxNamespace
>;
type _IInboxFollowUpsNamespace = RuntimeSatisfiesPublic<
  Runtime.IInboxFollowUpsNamespace,
  Public.IInboxFollowUpsNamespace
>;
type _IInsightsNamespace = RuntimeSatisfiesPublic<
  Runtime.IInsightsNamespace,
  Public.IInsightsNamespace
>;
type _IMessageInterfaceChannelsNamespace = RuntimeSatisfiesPublic<
  Runtime.IMessageInterfaceChannelsNamespace,
  Public.IMessageInterfaceChannelsNamespace
>;
type _IMessagingNamespace = RuntimeSatisfiesPublic<
  Runtime.IMessagingNamespace,
  Public.IMessagingNamespace
>;
type _IOperationalHealthNamespace = RuntimeSatisfiesPublic<
  Runtime.IOperationalHealthNamespace,
  Public.IOperationalHealthNamespace
>;
type _IPermissionsNamespace = RuntimeSatisfiesPublic<
  Runtime.IPermissionsNamespace,
  Public.IPermissionsNamespace
>;
type _IPromptsNamespace = RuntimeSatisfiesPublic<
  Runtime.IPromptsNamespace,
  Public.IPromptsNamespace
>;
type _ISemanticNamespace = RuntimeSatisfiesPublic<
  Runtime.ISemanticNamespace,
  Public.ISemanticNamespace
>;
type _IServiceTemplatesNamespace = RuntimeSatisfiesPublic<
  Runtime.IServiceTemplatesNamespace,
  Public.IServiceTemplatesNamespace
>;
type _IViewsNamespace = RuntimeSatisfiesPublic<
  Runtime.IViewsNamespace,
  Public.IViewsNamespace
>;

// Services and payloads the contexts hand over.
type _IEntityService = RuntimeSatisfiesPublic<
  Runtime.IEntityService,
  Public.IEntityService
>;
type _RuntimeUploadStore = RuntimeSatisfiesPublic<
  Runtime.RuntimeUploadStore,
  Public.RuntimeUploadStore
>;
type _BaseJobTrackingInfo = RuntimeSatisfiesPublic<
  Runtime.BaseJobTrackingInfo,
  Public.BaseJobTrackingInfo
>;
type _JobProgressEvent = RuntimeSatisfiesPublic<
  Runtime.JobProgressEvent,
  Public.JobProgressEvent
>;
// Generic, so instantiated at a concrete argument: the pairing is what is
// under test, not the type parameter.
type _JudgeInput = RuntimeSatisfiesPublic<
  Runtime.JudgeInput<{ ok: boolean }>,
  Public.JudgeInput<{ ok: boolean }>
>;
type _EvalHandler = RuntimeSatisfiesPublic<
  Runtime.EvalHandler,
  Public.EvalHandler
>;
type _InsightHandler = RuntimeSatisfiesPublic<
  Runtime.InsightHandler,
  Public.InsightHandler
>;
type _urlCaptureConfigSchema = RuntimeSatisfiesPublic<
  typeof Runtime.urlCaptureConfigSchema,
  typeof Public.urlCaptureConfigSchema
>;

// Channels, plugin configuration, and the runtime upload store.
type _Channel = RuntimeSatisfiesPublic<
  Runtime.Channel<{ id: string }>,
  Public.Channel<{ id: string }>
>;
type _defineChannel = RuntimeSatisfiesPublic<
  typeof Runtime.defineChannel,
  typeof Public.defineChannel
>;
type _MessageJobTrackingInfo = RuntimeSatisfiesPublic<
  Runtime.MessageJobTrackingInfo,
  Public.MessageJobTrackingInfo
>;
type _IRuntimeUploadsNamespace = RuntimeSatisfiesPublic<
  Runtime.IRuntimeUploadsNamespace,
  Public.IRuntimeUploadsNamespace
>;
type _RuntimeUploadRecord = RuntimeSatisfiesPublic<
  Runtime.RuntimeUploadRecord,
  Public.RuntimeUploadRecord
>;
type _ResolvedRuntimeUpload = RuntimeSatisfiesPublic<
  Runtime.ResolvedRuntimeUpload,
  Public.ResolvedRuntimeUpload
>;
type _RuntimeUploadResponseBody = RuntimeSatisfiesPublic<
  Runtime.RuntimeUploadResponseBody,
  Public.RuntimeUploadResponseBody
>;
type _RuntimeUploadScopeOptions = RuntimeSatisfiesPublic<
  Runtime.RuntimeUploadScopeOptions,
  Public.RuntimeUploadScopeOptions
>;
type _SaveRuntimeUploadInput = RuntimeSatisfiesPublic<
  Runtime.SaveRuntimeUploadInput,
  Public.SaveRuntimeUploadInput
>;

// Restated from packages this one does not re-export them from, so the pairing
// is invisible at `src/index.ts` and has to be named here.
type _Logger = RuntimeSatisfiesPublic<UtilsLogger, Public.Logger>;
type _FrontmatterSchemaParser = RuntimeSatisfiesPublic<
  EntityContext.FrontmatterSchemaParser,
  Public.FrontmatterSchemaParser
>;
type _EntityPluginEntitiesNamespace = RuntimeSatisfiesPublic<
  EntityContext.EntityPluginEntitiesNamespace,
  Public.EntityPluginEntitiesNamespace
>;

/**
 * Keeps the assertions above from being reported as unused declarations.
 *
 * This file is checked by `bun run typecheck`, not by `bun test`: the
 * assertions are the type aliases above, and there is nothing to run. A
 * reader who lands here from a typecheck error has found the guard; the rest
 * of the invariant lives in the contexts' extends clauses.
 */
export type PublicSurfaceAssertions = [
  _Plugin,
  _BasePluginContext,
  _ServicePluginContext,
  _EntityPluginContext,
  _InterfacePluginContext,
  _MessageInterfacePluginContext,
  _IChannelsNamespace,
  _IConversationsNamespace,
  _IEvalNamespace,
  _IIdentityNamespace,
  _IInboxNamespace,
  _IInboxFollowUpsNamespace,
  _IInsightsNamespace,
  _IMessageInterfaceChannelsNamespace,
  _IMessagingNamespace,
  _IOperationalHealthNamespace,
  _IPermissionsNamespace,
  _IPromptsNamespace,
  _ISemanticNamespace,
  _IServiceTemplatesNamespace,
  _IViewsNamespace,
  _IEntityService,
  _RuntimeUploadStore,
  _BaseJobTrackingInfo,
  _JobProgressEvent,
  _JudgeInput,
  _EvalHandler,
  _InsightHandler,
  _urlCaptureConfigSchema,
  _Channel,
  _defineChannel,
  _MessageJobTrackingInfo,
  _IRuntimeUploadsNamespace,
  _RuntimeUploadRecord,
  _ResolvedRuntimeUpload,
  _RuntimeUploadResponseBody,
  _RuntimeUploadScopeOptions,
  _SaveRuntimeUploadInput,
  _Logger,
  _FrontmatterSchemaParser,
  _EntityPluginEntitiesNamespace,
];
