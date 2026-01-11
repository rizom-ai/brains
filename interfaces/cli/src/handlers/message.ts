import type { MessageContext } from "@brains/plugins";

/**
 * Message handlers for CLI interface
 */
export class MessageHandlers {
  private responseCallback: ((response: string) => void) | undefined;

  /**
   * Register callback to receive response events
   */
  public registerResponseCallback(callback: (response: string) => void): void {
    this.responseCallback = callback;
  }

  /**
   * Unregister response callbacks
   */
  public unregisterMessageCallbacks(): void {
    this.responseCallback = undefined;
  }

  /**
   * Send a message using CLI callback system
   */
  public async sendMessage(
    content: string,
    _context: MessageContext,
    _replyToId?: string,
  ): Promise<string> {
    // Use callback to send response
    if (this.responseCallback) {
      this.responseCallback(content);
    }
    // Return a synthetic message ID for CLI
    return `cli-msg-${Date.now()}`;
  }

  /**
   * Edit message - for CLI, just send new message (React component will handle replacement)
   */
  public async editMessage(
    _messageId: string,
    content: string,
    _context: MessageContext,
  ): Promise<void> {
    // For CLI, editing means sending a new message
    // The React component will detect progress messages and handle replacement
    if (this.responseCallback) {
      this.responseCallback(content);
    }
  }
}
