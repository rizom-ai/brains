import { SdkError } from "@brains/sdk/services";
import {
  internalFullScope,
  type ClaimedSystemType,
} from "@brains/sdk/internal/service-runtime";
import { computeContentHash } from "@brains/utils/hash";
import type {
  ProfileImportFieldName,
  ProfileImportFields,
} from "@brains/contracts";
import { mergeProfileImport, type ProfileImportMerge } from "./merge-profile";

/** The anchor profile's records, as profile keeps them. */
export type AnchorProfileRecords = Pick<
  ClaimedSystemType,
  "getEntity" | "updateEntity"
>;

export interface ProfileImportPreview {
  fields: ProfileImportMerge["fields"];
  /** True when the import would fill at least one field. */
  changed: boolean;
  /** Binds a confirmation to these imported values and this profile revision. */
  revision: string;
}

interface Prepared {
  preview: ProfileImportPreview;
  merge: ProfileImportMerge;
  contentHash: string;
  write(content: string): ReturnType<AnchorProfileRecords["updateEntity"]>;
}

async function prepare(
  anchor: AnchorProfileRecords,
  imported: ProfileImportFields,
): Promise<Prepared> {
  // The owner's profile, at every visibility: an import fills theirs.
  const profile = await anchor.getEntity({
    entityType: "anchor-profile",
    id: "anchor-profile",
    visibilityScope: internalFullScope("a profile import reads the owner"),
  });
  if (!profile) {
    throw new SdkError("not_found", {
      publicMessage: "This brain has no anchor profile yet.",
    });
  }
  const merge = mergeProfileImport(profile.content, imported);
  return {
    merge,
    contentHash: profile.contentHash,
    preview: {
      fields: merge.fields,
      changed: merge.changed,
      revision: computeContentHash(
        JSON.stringify([profile.contentHash, merge.fields]),
      ),
    },
    // Only while the profile is still the one this import read.
    write: (content) =>
      anchor.updateEntity({
        entity: { ...profile, content },
        options: { expectedContentHash: profile.contentHash },
      }),
  };
}

const changedMeanwhile = (): SdkError =>
  new SdkError("conflict", {
    publicMessage:
      "The profile changed while importing; review the import again.",
  });

/** What an import would fill and keep, against the profile as it stands. */
export async function previewProfileImport(
  anchor: AnchorProfileRecords,
  imported: ProfileImportFields,
): Promise<ProfileImportPreview> {
  return (await prepare(anchor, imported)).preview;
}

/**
 * Fill the profile from an import previewed at `revision`, writing only
 * while the profile is still the one it previewed.
 */
export async function applyProfileImport(
  anchor: AnchorProfileRecords,
  imported: ProfileImportFields,
  revision: string,
): Promise<{
  filled: ProfileImportFieldName[];
  kept: ProfileImportFieldName[];
}> {
  const { preview, merge, write } = await prepare(anchor, imported);
  if (preview.revision !== revision) throw changedMeanwhile();
  const result = {
    filled: preview.fields
      .filter((field) => field.outcome === "fill")
      .map((field) => field.field),
    kept: preview.fields
      .filter((field) => field.outcome === "preserve")
      .map((field) => field.field),
  };
  if (!preview.changed) return result;
  const written = await write(merge.content);
  if (written.skipReason === "content-conflict") throw changedMeanwhile();
  return result;
}
