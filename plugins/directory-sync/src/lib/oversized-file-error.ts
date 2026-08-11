export const DEFAULT_MAX_IMPORT_FILE_BYTES: number = 5 * 1024 * 1024;

export class OversizedFileError extends Error {
  readonly filePath: string;
  readonly sizeBytes: number;
  readonly limitBytes: number;

  constructor(filePath: string, sizeBytes: number, limitBytes: number) {
    super(
      `File is ${sizeBytes} bytes; import limit is ${limitBytes} bytes: ${filePath}`,
    );
    this.name = "OversizedFileError";
    this.filePath = filePath;
    this.sizeBytes = sizeBytes;
    this.limitBytes = limitBytes;
  }
}
