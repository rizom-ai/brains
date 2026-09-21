export interface PublishResult {
  id: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

/** A borrowed, verified file. Publishers must settle inside its provider's
 * scope and observe cancellation before submitting a subsequent stage. */
export interface PublishImageData {
  sourceFile: string;
  sizeBytes: number;
  sha256: string;
  mimeType: string;
  signal: AbortSignal;
}

export type PublishMediaData = PublishImageData &
  (
    | { type: "document"; mimeType: "application/pdf"; filename: string }
    | { type: "image"; mimeType: "image/png"; filename: string }
  );

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
