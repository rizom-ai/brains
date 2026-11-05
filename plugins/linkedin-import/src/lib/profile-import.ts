import { createHash } from "node:crypto";
import {
  internalFullScope,
  type BaseEntity,
  type ServiceEntityService,
} from "@brains/plugins";
import type { LinkedInClient } from "./linkedin-client";
import { mapLinkedInProfile } from "./profile-mapper";
import { mergeProfileImport, type ImportedField } from "./merge-profile";

export interface ProfileImportPreview {
  fields: ImportedField[];
  /** True when the import would fill at least one field. */
  changed: boolean;
  /** Binds a confirmation to these LinkedIn values and this profile revision. */
  revision: string;
}

export interface ProfileImportResult {
  filled: string[];
  kept: string[];
}

interface Prepared {
  profile: BaseEntity;
  content: string;
  preview: ProfileImportPreview;
}

/** Previews and applies a LinkedIn import into the anchor profile. */
export class ProfileImport {
  private readonly client: LinkedInClient;
  private readonly entityService: ServiceEntityService;

  constructor(client: LinkedInClient, entityService: ServiceEntityService) {
    this.client = client;
    this.entityService = entityService;
  }

  async preview(): Promise<ProfileImportPreview> {
    return (await this.prepare()).preview;
  }

  /** Writes only while the profile is still the one this import read. */
  async apply(): Promise<ProfileImportResult> {
    const { profile, content, preview } = await this.prepare();
    const result = {
      filled: preview.fields
        .filter((field) => field.outcome === "fill")
        .map((field) => field.field),
      kept: preview.fields
        .filter((field) => field.outcome === "preserve")
        .map((field) => field.field),
    };
    if (!preview.changed) return result;
    const written = await this.entityService.updateEntity({
      entity: { ...profile, content },
      options: { expectedContentHash: profile.contentHash },
    });
    if (written.skipReason === "content-conflict") {
      throw new Error(
        "The profile changed while importing; review the import again.",
      );
    }
    return result;
  }

  private async prepare(): Promise<Prepared> {
    const profile = await this.entityService.getEntity({
      entityType: "anchor-profile",
      id: "anchor-profile",
      visibilityScope: internalFullScope("LinkedIn import reads the owner"),
    });
    if (!profile) throw new Error("This brain has no anchor profile yet.");
    const imported = mapLinkedInProfile(await this.client.fetchProfile());
    const merge = mergeProfileImport(profile.content, imported);
    const revision = createHash("sha256")
      .update(JSON.stringify([profile.contentHash, merge.fields]))
      .digest("hex");
    return {
      profile,
      content: merge.content,
      preview: { fields: merge.fields, changed: merge.changed, revision },
    };
  }
}
