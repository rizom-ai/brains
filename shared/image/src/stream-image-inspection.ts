import {
  detectImageFormat,
  inspectImageBytes,
  type InspectedImage,
} from "./lib/image-utils";

const frameMarkers: ReadonlySet<number> = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

/** Actor-only signature/dimension inspection: 32 header bytes and five SOF bytes.
 * JPEG segment payloads are skipped, so APP/EXIF length does not grow residency.
 * This inspects headers, not pixel decodability, like inspectImageBytes.
 */
export class StreamImageInspection {
  private readonly header = new Uint8Array(32);
  private used = 0;
  private total = 0;
  private initialized = false;
  private jpeg = false;
  private phase: "scan" | "marker" | "high" | "low" | "payload" = "scan";
  private marker = 0;
  private length = 0;
  private remaining = 0;
  private sof = false;
  private readonly dimensions = new Uint8Array(5);
  private dimensionBytes = 0;
  private width = 0;
  private height = 0;
  private stopped = false;
  public observe(bytes: Uint8Array): void {
    this.total += bytes.length;
    let offset = 0;
    if (this.used < this.header.length) {
      const count = Math.min(bytes.length, this.header.length - this.used);
      this.header.set(bytes.subarray(0, count), this.used);
      this.used += count;
      offset = count;
    }
    if (!this.initialized && this.used === this.header.length)
      this.initialize();
    if (this.initialized && this.jpeg) this.scan(bytes.subarray(offset));
  }
  private initialize(): void {
    this.initialized = true;
    this.jpeg =
      detectImageFormat(this.header.subarray(0, this.used)) === "jpeg";
    if (this.jpeg) this.scan(this.header.subarray(2, this.used));
  }
  private scan(bytes: Uint8Array): void {
    let offset = 0;
    while (offset < bytes.length && !this.stopped && this.width === 0) {
      if (this.phase === "payload") {
        const count = Math.min(this.remaining, bytes.length - offset);
        if (this.sof && this.dimensionBytes < 5) {
          const copied = Math.min(count, 5 - this.dimensionBytes);
          this.dimensions.set(
            bytes.subarray(offset, offset + copied),
            this.dimensionBytes,
          );
          this.dimensionBytes += copied;
          if (this.dimensionBytes === 5) {
            this.height =
              (this.dimensions[1] ?? 0) * 256 + (this.dimensions[2] ?? 0);
            this.width =
              (this.dimensions[3] ?? 0) * 256 + (this.dimensions[4] ?? 0);
          }
        }
        offset += count;
        this.remaining -= count;
        if (this.remaining === 0) this.phase = "scan";
        continue;
      }
      const byte = bytes[offset++];
      if (byte === undefined) break;
      switch (this.phase) {
        case "scan":
          if (byte === 0xff) this.phase = "marker";
          break;
        case "marker":
          if (byte === 0xff) break;
          if (byte === 0xd9 || byte === 0xda) {
            this.stopped = true;
            break;
          }
          if (byte === 1 || (byte >= 0xd0 && byte <= 0xd7)) {
            this.phase = "scan";
            break;
          }
          this.marker = byte;
          this.phase = "high";
          break;
        case "high":
          this.length = byte * 256;
          this.phase = "low";
          break;
        case "low":
          this.length += byte;
          if (this.length < 2) throw new Error("Invalid JPEG segment length");
          this.remaining = this.length - 2;
          this.sof = frameMarkers.has(this.marker);
          if (this.sof && this.remaining < 6)
            throw new Error("Invalid JPEG frame length");
          this.dimensionBytes = 0;
          this.phase = this.remaining ? "payload" : "scan";
          break;
      }
    }
  }
  public finish(): InspectedImage {
    if (!this.initialized) this.initialize();
    if (!this.jpeg)
      return {
        ...inspectImageBytes(this.header.subarray(0, this.used)),
        sizeBytes: this.total,
      };
    if (!this.width || !this.height)
      throw new Error("Could not detect valid image dimensions");
    return {
      format: "jpeg",
      mediaType: "image/jpeg",
      width: this.width,
      height: this.height,
      sizeBytes: this.total,
    };
  }
}
