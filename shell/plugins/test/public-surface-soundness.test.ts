import { describe, expect, it } from "bun:test";
import type * as Public from "../src/public/types";
import type * as BaseCtx from "../src/base/context";
import type * as BaseCtxTypes from "../src/base/context-types";
import type * as EntityCtx from "../src/entity/context";
import type * as InterfaceCtx from "../src/interface/context";
import type * as ServiceCtx from "../src/service/context";
import type * as UploadRegistry from "../src/service/upload-registry";
import type * as Interfaces from "../src/interfaces";

/**
 * `src/public/types.ts` is the authoring surface published as
 * `@rizom/brain/plugins`. It restates types that also exist internally, and it
 * restates them deliberately: the real `BasePluginContext` carries 46 members,
 * the published one 23. `jobs`, `runtimeState`, `plugins`, `dashboard`,
 * `endpoints`, `gitBrokerSocket` and the rest are withheld on purpose, and
 * `IViewsNamespace` / `IServiceTemplatesNamespace` are weakened to `unknown` so
 * internal template types stay out of the generated declarations.
 *
 * So the two copies are not supposed to be identical, and asserting identity
 * would be wrong — it would push internal plumbing into the SDK. The property
 * that must hold is one-directional:
 *
 *   the runtime type must satisfy the published type
 *
 * Narrowing stays legal. What this rejects is the SDK promising a member the
 * runtime does not have, or giving a shared member a type the runtime does not
 * satisfy — which is the failure mode that actually reaches external authors,
 * because their code compiles against a shape the object never had.
 *
 * These are type-level assertions checked by `bun run typecheck`. A violation
 * reports here as "does not satisfy the constraint".
 */

type RuntimeSatisfiesPublic<Runtime extends Published, Published> = Runtime;

type _BasePluginContext = RuntimeSatisfiesPublic<
  BaseCtx.BasePluginContext,
  Public.BasePluginContext
>;
type _ServicePluginContext = RuntimeSatisfiesPublic<
  ServiceCtx.ServicePluginContext,
  Public.ServicePluginContext
>;
type _EntityPluginContext = RuntimeSatisfiesPublic<
  EntityCtx.EntityPluginContext,
  Public.EntityPluginContext
>;
type _InterfacePluginContext = RuntimeSatisfiesPublic<
  InterfaceCtx.InterfacePluginContext,
  Public.InterfacePluginContext
>;
type _MessageInterfacePluginContext = RuntimeSatisfiesPublic<
  InterfaceCtx.MessageInterfacePluginContext,
  Public.MessageInterfacePluginContext
>;
type _Plugin = RuntimeSatisfiesPublic<Interfaces.Plugin, Public.Plugin>;
type _IMessagingNamespace = RuntimeSatisfiesPublic<
  BaseCtxTypes.IMessagingNamespace,
  Public.IMessagingNamespace
>;
type _IPermissionsNamespace = RuntimeSatisfiesPublic<
  BaseCtxTypes.IPermissionsNamespace,
  Public.IPermissionsNamespace
>;
type _IInboxNamespace = RuntimeSatisfiesPublic<
  BaseCtxTypes.IInboxNamespace,
  Public.IInboxNamespace
>;
type _IChannelsNamespace = RuntimeSatisfiesPublic<
  BaseCtxTypes.IChannelsNamespace,
  Public.IChannelsNamespace
>;
type _IRuntimeUploadsNamespace = RuntimeSatisfiesPublic<
  UploadRegistry.IRuntimeUploadsNamespace,
  Public.IRuntimeUploadsNamespace
>;
type _RuntimeUploadResponseBody = RuntimeSatisfiesPublic<
  UploadRegistry.RuntimeUploadResponseBody,
  Public.RuntimeUploadResponseBody
>;
type _IServiceTemplatesNamespace = RuntimeSatisfiesPublic<
  ServiceCtx.IServiceTemplatesNamespace,
  Public.IServiceTemplatesNamespace
>;
type _IViewsNamespace = RuntimeSatisfiesPublic<
  ServiceCtx.IViewsNamespace,
  Public.IViewsNamespace
>;
type _EntityPluginEntitiesNamespace = RuntimeSatisfiesPublic<
  EntityCtx.EntityPluginEntitiesNamespace,
  Public.EntityPluginEntitiesNamespace
>;

/** Keeps the assertions above from being reported as unused declarations. */
export type PublicSurfaceAssertions = [
  _BasePluginContext,
  _ServicePluginContext,
  _EntityPluginContext,
  _InterfacePluginContext,
  _MessageInterfacePluginContext,
  _Plugin,
  _IMessagingNamespace,
  _IPermissionsNamespace,
  _IInboxNamespace,
  _IChannelsNamespace,
  _IRuntimeUploadsNamespace,
  _RuntimeUploadResponseBody,
  _IServiceTemplatesNamespace,
  _IViewsNamespace,
  _EntityPluginEntitiesNamespace,
];

describe("published plugin surface soundness", () => {
  it("keeps every runtime context assignable to its published counterpart", () => {
    // Enforced by the type-level assertions above, which fail `bun run
    // typecheck`. This case documents the guard so a reader who lands here from
    // a typecheck error knows what broke and why identity is not the rule.
    expect(true).toBe(true);
  });
});
