export const DEFAULT_MAX_ASSET_IMPORT_BYTES: number = 100 * 1024 * 1024;

export type ImportLimitKind = "ordinary" | "asset";

/** A source file exceeded the policy for its registered storage path. */
export class OversizedImportFileError extends Error {
  public readonly filePath: string;
  public readonly sizeBytes: number;
  public readonly maxBytes: number;
  public readonly limitKind: ImportLimitKind;

  constructor(options: {
    filePath: string;
    sizeBytes: number;
    maxBytes: number;
    limitKind: ImportLimitKind;
  }) {
    const label = options.limitKind === "asset" ? "asset" : "ordinary";
    super(
      `File ${options.filePath} (${options.sizeBytes} bytes) exceeds ${label} import limit of ${options.maxBytes} bytes`,
    );
    this.name = "OversizedImportFileError";
    this.filePath = options.filePath;
    this.sizeBytes = options.sizeBytes;
    this.maxBytes = options.maxBytes;
    this.limitKind = options.limitKind;
  }
}
