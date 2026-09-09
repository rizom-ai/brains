import type { ProgressContract } from "@brains/utils/progress";
import type {
  IIdentityNamespace,
  IProfileKindsNamespace,
  IPermissionsNamespace,
} from "../base/context-types";
import type {
  JobAttachmentReader,
  JobHandlerContext,
  JobUploadReader,
} from "../job/job-context-contract";

/** Jobs report progress; the runtime owns reporters and heartbeat lifecycles. */
export function createJobProgress(source: ProgressContract): ProgressContract {
  return Object.freeze({ report: source.report.bind(source) });
}

/** Project methods, not just types, and keep the original receiver private. */
export function createPermissionChecker(
  source: IPermissionsNamespace,
): IPermissionsNamespace {
  return Object.freeze({
    assertEntityActionAllowed: source.assertEntityActionAllowed.bind(source),
  });
}

export function createProfileSelectionReader(
  source: Pick<IProfileKindsNamespace, "getResolved">,
): Pick<IProfileKindsNamespace, "getResolved"> {
  return Object.freeze({ getResolved: source.getResolved.bind(source) });
}

export function createIdentityReader(
  source: Pick<IIdentityNamespace, "get" | "getProfile">,
): Pick<IIdentityNamespace, "get" | "getProfile"> {
  return Object.freeze({
    get: source.get.bind(source),
    getProfile: source.getProfile.bind(source),
  });
}

export function createJobUploadReader(
  source: JobUploadReader,
): JobUploadReader {
  return Object.freeze({ read: source.read.bind(source) });
}

export function createJobAttachmentReader(
  source: JobAttachmentReader,
): JobAttachmentReader {
  return Object.freeze({ resolve: source.resolve.bind(source) });
}

export function createJobIdentityReader(
  source: JobHandlerContext<unknown>["identity"],
): JobHandlerContext<unknown>["identity"] {
  return Object.freeze({ getProfile: source.getProfile.bind(source) });
}
