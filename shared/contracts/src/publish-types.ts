export interface PublishResult {
  id: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface PublishImageData {
  data: Buffer;
  mimeType: string;
}

export interface PublishMediaData {
  type: "document";
  data: Buffer;
  mimeType: "application/pdf";
  filename: string;
}

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
