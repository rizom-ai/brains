import type { MessageContext } from "../types.js";

export interface ResponseFormatOptions {
  showTimestamp?: boolean;
  showUserId?: boolean;
  showChannel?: boolean;
  maxLength?: number;
}

export class ResponseFormatter {
  constructor(private options: ResponseFormatOptions = {}) {}

  public formatResponse(content: string, context?: MessageContext): string {
    let formatted = content;

    // Truncate if needed
    if (this.options.maxLength && formatted.length > this.options.maxLength) {
      formatted = formatted.substring(0, this.options.maxLength - 3) + "...";
    }

    // Add metadata if requested
    const metadata: string[] = [];
    if (context) {
      if (this.options.showTimestamp) {
        metadata.push(`[${context.timestamp.toISOString()}]`);
      }
      if (this.options.showUserId) {
        metadata.push(`@${context.userId}`);
      }
      if (this.options.showChannel) {
        metadata.push(`#${context.channelId}`);
      }
    }

    if (metadata.length > 0) {
      return `${metadata.join(" ")} ${formatted}`;
    }

    return formatted;
  }

  public formatError(error: Error | string): string {
    const message = error instanceof Error ? error.message : error;
    return `❌ Error: ${message}`;
  }

  public formatSuccess(message: string): string {
    return `✅ ${message}`;
  }

  public formatWarning(message: string): string {
    return `⚠️  ${message}`;
  }

  public formatInfo(message: string): string {
    return `ℹ️  ${message}`;
  }
}