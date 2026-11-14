export interface PublishResult {
  id: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface PublishImageData {
  data: Uint8Array;
  mimeType: string;
}

export type PublishMediaData =
  | {
      type: "document";
      data: Uint8Array;
      mimeType: "application/pdf";
      filename: string;
    }
  | {
      type: "image";
      data: Uint8Array;
      mimeType: "image/png";
      filename: string;
    };

export interface PublishProvider {
  name: string;
  publish(
    content: string,
    metadata: Record<string, unknown>,
    imageData?: PublishImageData,
    documentData?: PublishMediaData[],
  ): Promise<PublishResult>;
  validateCredentials?(): Promise<boolean>;
}

/**
 * The provider of a type that publishes to the brain's own site: it calls
 * nothing outside the brain and records the outcome.
 */
export const internalPublishProvider: PublishProvider = {
  name: "internal",
  publish: async (): Promise<PublishResult> => ({ id: "internal" }),
};
