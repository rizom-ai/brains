import {
  SdkError,
  type BusContract,
  type BusResult,
  profileImportApplyContract,
  profileImportPreviewContract,
  type ProfileImportField,
  type ProfileImportFieldName,
} from "@brains/contracts";
import type { z } from "@brains/utils/zod";
import { LinkedInClient, type LinkedInFetch } from "./linkedin-client";
import { mapLinkedInProfile } from "./profile-mapper";

export interface ProfileImportPreview {
  fields: ProfileImportField[];
  /** True when the import would fill at least one field. */
  changed: boolean;
  /** Binds a confirmation to these LinkedIn values and this profile revision. */
  revision: string;
}

export interface ProfileImportResult {
  filled: ProfileImportFieldName[];
  kept: ProfileImportFieldName[];
}

/** Asking another package by its contract, as this plugin. */
export interface ProfileImportMessaging {
  request<TRequest extends z.ZodType, TResponse extends z.ZodType>(
    contract: BusContract<TRequest, TResponse, "request">,
    request: z.input<TRequest>,
  ): Promise<BusResult<z.output<TResponse>>>;
}

/** The steward's answer, or its refusal with its code and public message. */
function answered<T>(result: BusResult<T>): T {
  if (result.status === "answered") return result.data;
  if (result.status === "failed") {
    throw new SdkError(result.error.code, {
      message: result.error.message,
      publicMessage: result.error.message,
    });
  }
  throw new SdkError("no_handler", {
    message: "No package keeps the anchor profile",
    publicMessage: "This brain keeps no anchor profile to import into.",
  });
}

/**
 * Previews and applies a LinkedIn import into the anchor profile. Profile
 * stewards the anchor profile, so the import asks it: profile decides what
 * is filled and what stays as the owner wrote it.
 */
export class ProfileImport {
  private readonly messaging: ProfileImportMessaging;
  private readonly fetchFn: LinkedInFetch | undefined;

  constructor(messaging: ProfileImportMessaging, fetchFn?: LinkedInFetch) {
    this.messaging = messaging;
    this.fetchFn = fetchFn;
  }

  async preview(accessToken: string): Promise<ProfileImportPreview> {
    return this.previewFields(await this.imported(accessToken));
  }

  /** Writes only while the profile is still the one this import read. */
  async apply(accessToken: string): Promise<ProfileImportResult> {
    const fields = await this.imported(accessToken);
    const { revision } = await this.previewFields(fields);
    return answered(
      await this.messaging.request(profileImportApplyContract, {
        fields,
        revision,
      }),
    );
  }

  private async previewFields(
    fields: ReturnType<typeof mapLinkedInProfile>,
  ): Promise<ProfileImportPreview> {
    return answered(
      await this.messaging.request(profileImportPreviewContract, { fields }),
    );
  }

  private async imported(
    accessToken: string,
  ): Promise<ReturnType<typeof mapLinkedInProfile>> {
    const client = new LinkedInClient(accessToken, this.fetchFn);
    return mapLinkedInProfile(await client.fetchProfile());
  }
}
