import type { BusContract } from "@brains/contracts";
import type { IRuntimeStateNamespace } from "@brains/runtime-state";
import type { z } from "@brains/utils/zod";
import type { IPublicSkillsNamespace } from "../a2a/public-skills";
import type {
  IIdentityNamespace,
  IOperationalHealthNamespace,
} from "../base/context-types";
import type { OperationalHealthProvider } from "../operational-health-registry";
import {
  sharedUploadScope,
  type IRuntimeUploadsNamespace,
  type ScopedRuntimeUploadStore,
} from "../service/upload-registry";

/**
 * How a first-party runtime rides on a slot context the brain built: under
 * a symbol no public type names, read back only by the accessor that knows
 * it. A context the brain did not build, such as a test double, carries
 * none, and the accessor refuses it.
 */
export function attachFirstPartyRuntime<TContext extends object>(
  context: TContext,
  key: symbol,
  runtime: object,
): TContext {
  Object.defineProperty(context, key, {
    value: runtime,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return context;
}

/** The runtime a context carries under `key`, or none. */
export function firstPartyRuntimeOf(
  context: object,
  key: symbol,
): object | undefined {
  const runtime: unknown = Reflect.get(context, key);
  return typeof runtime === "object" && runtime !== null ? runtime : undefined;
}

/*
 * The narrowings the service and the interface runtime share: each hands a
 * first-party package one part of a plugin context's namespace, and nothing
 * beside it.
 */

/** The brain's character, its anchor's profile and the app's metadata, read-only. */
export function narrowIdentity(
  identity: Pick<IIdentityNamespace, "get" | "getProfile" | "getAppInfo">,
): Pick<IIdentityNamespace, "get" | "getProfile" | "getAppInfo"> {
  return Object.freeze({
    get: () => identity.get(),
    getProfile: () => identity.getProfile(),
    getAppInfo: () => identity.getAppInfo(),
  });
}

/** The public skills the brain advertises, listed and nothing else. */
export function publicSkillsOf(
  publicSkills: IPublicSkillsNamespace,
): Pick<IPublicSkillsNamespace, "list"> {
  return Object.freeze({ list: () => publicSkills.list() });
}

/**
 * The runtime's shared upload store (`upload`), served at the route the
 * caller names or, by default, the shared store's own.
 */
export function sharedUploadsOf(
  uploads: Pick<IRuntimeUploadsNamespace, "scoped">,
): (options?: {
  readonly routePath?: string | undefined;
}) => ScopedRuntimeUploadStore {
  return (options = {}) =>
    uploads.scoped({
      ...sharedUploadScope,
      ...(options.routePath ? { routePath: options.routePath } : {}),
    });
}

/**
 * Runtime state under the namespace a class named, rather than one
 * qualified by its package: scoped stores opened, and nothing else.
 */
export function classRuntimeStateOf(
  runtimeState: Pick<IRuntimeStateNamespace, "scoped">,
): Pick<IRuntimeStateNamespace, "scoped"> {
  return Object.freeze({ scoped: runtimeState.scoped.bind(runtimeState) });
}

/** Reports a health check, taken off when the package shuts down. */
export function releasingOperationalHealth(
  operationalHealth: Pick<IOperationalHealthNamespace, "register">,
  onRelease: (release: () => void) => void,
): (name: string, provider: OperationalHealthProvider) => void {
  return (name, provider) => {
    onRelease(operationalHealth.register(name, provider));
  };
}

/**
 * A contract to answer, its response type erased. The bus checks an answer
 * against the contract's own schema, as the public answer does; erasing the
 * response type is what lets a handler typed by its contract hand the bus a
 * value the bus parses.
 */
export function eraseResponseType<TRequest extends z.ZodType>(
  contract: BusContract<TRequest, z.ZodType>,
): BusContract<TRequest, z.ZodType> {
  return contract;
}
